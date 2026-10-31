/* Système de connexion : comptes e-mail (dans le navigateur), Discord et Google (vérifiés par le serveur).
   Un même compte peut avoir Discord ET Google : le serveur relie les deux à un seul profil. */
(function () {
  "use strict";
  var CLE_COMPTES = "lni_comptes", CLE_SESSION = "lni_session";
  var CFG = SITE.connexion || {};
  var MIN = CFG.motDePasseMin || 8;
  var enc = new TextEncoder();

  function apiBase() { return SITE.actualites && SITE.actualites.urlApi ? SITE.actualites.urlApi.replace(/\/+$/, "") : ""; }
  function lire(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function utilisateur() { return lire(CLE_SESSION, null); }
  function enteteJeton(u) { return u && u.jeton ? { Authorization: (u.fournisseur === "google" ? "Google " : "Discord ") + u.jeton } : null; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function hash(mdp, sel) {
    return crypto.subtle.importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveBits"]).then(function (cle) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(sel), iterations: 100000, hash: "SHA-256" }, cle, 256);
    }).then(hex);
  }

  /* ----- Comptes e-mail (dans le navigateur) ----- */
  function inscrire(pseudo, email, mdp) {
    var c = lire(CLE_COMPTES, {}), id = email.toLowerCase();
    if (c[id]) return Promise.reject("Un compte existe déjà avec cet e-mail.");
    var sel = hex(crypto.getRandomValues(new Uint8Array(16)));
    return hash(mdp, sel).then(function (h) {
      c[id] = { pseudo: pseudo, email: email, sel: sel, hash: h };
      if (!ecrire(CLE_COMPTES, c)) throw "Impossible d'enregistrer le compte (stockage bloqué).";
      ecrire(CLE_SESSION, { pseudo: pseudo, email: email });
    });
  }
  function connecter(email, mdp) {
    var a = lire(CLE_COMPTES, {})[email.toLowerCase()];
    if (!a) return Promise.reject("E-mail ou mot de passe incorrect.");
    return hash(mdp, a.sel).then(function (h) {
      if (h !== a.hash) throw "E-mail ou mot de passe incorrect.";
      ecrire(CLE_SESSION, { pseudo: a.pseudo, email: a.email, avatar: a.avatar || "" });
    });
  }

  /* ----- Discord (flux "implicit", dans le navigateur) ----- */
  function urlRetour() { return CFG.urlRetour || new URL("index.html", location.href).href; }
  function lancerDiscord(lier) {
    if (!CFG.discordClientId) return "Connexion Discord pas encore configurée (discordClientId dans site.js).";
    var st = hex(crypto.getRandomValues(new Uint8Array(16)));
    try {
      sessionStorage.setItem("lni_oauth_state", st);
      sessionStorage.setItem("lni_oauth_page", location.href.split("#")[0]);
      if (lier) sessionStorage.setItem("lni_lier", "1"); else sessionStorage.removeItem("lni_lier");
    } catch (e) {}
    location.href = "https://discord.com/oauth2/authorize?response_type=token&client_id=" + encodeURIComponent(CFG.discordClientId) +
      "&scope=" + encodeURIComponent("identify email") + "&redirect_uri=" + encodeURIComponent(urlRetour()) + "&state=" + st;
    return "";
  }
  function retourDiscord() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.get("access_token") || !h.get("state")) return null;
    var attendu = null, page = null, lier = false;
    try {
      attendu = sessionStorage.getItem("lni_oauth_state"); page = sessionStorage.getItem("lni_oauth_page");
      lier = sessionStorage.getItem("lni_lier") === "1";
      sessionStorage.removeItem("lni_oauth_state"); sessionStorage.removeItem("lni_lier");
    } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    if (!attendu || attendu !== h.get("state")) return Promise.reject("Connexion Discord refusée (état invalide).");
    var jeton = h.get("access_token");
    if (lier) return lierAvec("discord", jeton).then(function () { msg("Compte Discord lié."); }, function (m) { msg(m); });
    return fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + jeton } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        ecrire(CLE_SESSION, { pseudo: d.global_name || d.username, email: d.email || "", fournisseur: "discord", id: "discord:" + d.id, jeton: jeton,
          avatar: d.avatar ? "https://cdn.discordapp.com/avatars/" + d.id + "/" + d.avatar + ".png?size=64" : "" });
        if (page && page !== location.href.split("#")[0]) location.href = page;
      }, function () { throw "Impossible de récupérer ton profil Discord."; });
  }

  /* ----- Liaison de comptes (même profil Discord + Google) ----- */
  // Appelé depuis la page Paramètres (ou juste après une redirection Discord)
  function lierAvec(fournisseur, jeton) {
    var u = utilisateur(), api = apiBase(), h = enteteJeton(u);
    if (!api) return Promise.reject("Le serveur n'est pas configuré.");
    if (!h) return Promise.reject("Connecte-toi avec Discord ou Google pour lier un autre compte.");
    return fetch(api + "/api/lier", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, h),
      body: JSON.stringify({ autre: { fournisseur: fournisseur, jeton: jeton } }) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw r.status === 401 ? "Ta connexion a expiré : reconnecte-toi puis réessaie." : (d.erreur || "Liaison impossible."); }); });
  }
  function msg(texte) {
    try { sessionStorage.setItem("lni_msg", texte); } catch (e) {}
    if (!/parametres\.html$/.test(location.pathname)) location.href = "parametres.html#connexions";
  }

  /* ----- Google (Google Identity Services) ----- */
  function jwt(t) {
    var b = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(decodeURIComponent(atob(b).split("").map(function (c) { return "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2); }).join("")));
  }
  var GOOGLE_BTN = '<button class="btn-google" type="button"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.500-.2-2.200H12v4.200h6.200a5.300 5.300 0 0 1-2.300 3.500v2.900h3.700c2.200-2 3.400-5 3.400-8.400z"/><path fill="#34A853" d="M12 24c3.100 0 5.700-1 7.600-2.800l-3.700-2.900c-1 .7-2.300 1.100-3.900 1.100-3 0-5.500-2-6.400-4.700H1.800v3A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.600 14.700a7.200 7.200 0 0 1 0-4.600v-3H1.800a12 12 0 0 0 0 10.600z"/><path fill="#EA4335" d="M12 4.800c1.700 0 3.200.6 4.400 1.700l3.300-3.300A11.900 11.900 0 0 0 12 0 12 12 0 0 0 1.800 7.100l3.800 3C6.500 6.800 9 4.800 12 4.800z"/></svg>Continuer avec Google</button>';
  var gsiPret = null;
  function chargerGoogle() {
    if (gsiPret) return gsiPret;
    gsiPret = new Promise(function (ok, ko) {
      if (window.google && google.accounts) return ok();
      var s = document.createElement("script");
      s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = ok; s.onerror = function () { gsiPret = null; ko(); };
      document.head.appendChild(s);
    });
    return gsiPret;
  }
  // Bouton Google officiel. "surJeton" reçoit le jeton brut (le serveur le vérifie).
  function boutonGoogle(cible, surJeton, surErreur) {
    chargerGoogle().then(function () {
      google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: function (r) {
        try { surJeton(r.credential, jwt(r.credential)); } catch (e) { surErreur("Connexion Google impossible."); }
      } });
      google.accounts.id.renderButton(cible, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: cible.clientWidth || 364, locale: "fr" });
    }, function () { surErreur("Impossible de charger Google (bloqueur de pub ?)."); });
  }

  /* ----- Synchronisation avec le serveur (identifiant du compte, pseudo, photo, admin) ----- */
  function synchroniser() {
    var u = utilisateur(), api = apiBase(), h = enteteJeton(u);
    if (!api || !h) return Promise.resolve();
    return fetch(api + "/api/moi", { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d) return;
      var s = utilisateur();
      if (!s || s.jeton !== u.jeton) return;
      s.uid = d.id; s.pseudo = d.nom || s.pseudo; s.avatar = d.avatar || ""; s.admin = !!d.admin; s.principal = d.principal;
      ecrire(CLE_SESSION, s); majBouton();
    }).catch(function () {});
  }

  function deconnecter() { try { localStorage.removeItem(CLE_SESSION); } catch (e) {} }

  /* ----- Interface : bouton du haut et menu de compte ----- */
  var btns = Array.prototype.slice.call(document.querySelectorAll(".js-compte"));
  var menu = null;
  function fermerMenu() { if (menu) { menu.remove(); menu = null; } }

  function majBouton() {
    var u = utilisateur();
    btns.forEach(function (b) { b.innerHTML = contenuBouton(u); });
    document.dispatchEvent(new Event("lni:session"));
  }
  function contenuBouton(u) {
    return u ? (u.avatar ? '<img class="avatar" src="' + esc(u.avatar) + '" alt="" referrerpolicy="no-referrer">' : ICON.user) + esc(u.pseudo) : "Se connecter";
  }

  btns.forEach(function (b) { b.addEventListener("click", function () { cliquer(b); }); });
  function cliquer(btn) {
    var u = utilisateur();
    if (!u) { ouvrirModal("connexion"); return; }
    if (menu) { fermerMenu(); return; }
    menu = document.createElement("div");
    menu.className = "compte-menu";
    menu.innerHTML = '<div class="cm-tete"><strong>' + esc(u.pseudo) + '</strong><span class="cm-role">' + (u.admin ? "Administrateur" : "Joueur") + '</span></div>' +
      (u.uid ? '<a class="compte-lien" href="profil.html?id=' + encodeURIComponent(u.uid) + '">' + ICON.user + 'Mon profil</a>' : "") +
      '<a class="compte-lien" href="fil.html">' + ICON.news + 'Fil</a>' +
      '<a class="compte-lien" href="parametres.html">' + ICON.settings + 'Paramètres</a>' +
      '<button type="button" class="js-logout">' + ICON.logout + "Se déconnecter</button>";
    menu.querySelector(".js-logout").addEventListener("click", function () { deconnecter(); fermerMenu(); majBouton(); });
    btn_parent(btn).appendChild(menu);
  }
  function btn_parent(btn) { return btn.parentNode; }
  document.addEventListener("click", function (e) { if (menu && !e.target.closest(".compte-wrap")) fermerMenu(); });

  function ouvrirModal(mode, message) {
    document.dispatchEvent(new Event("lni:modal"));
    var fond = document.createElement("div");
    fond.className = "modal-fond";
    fond.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titre">' +
      '<button class="modal-x" type="button" aria-label="Fermer">' + ICON.close + "</button>" +
      '<h2 id="modal-titre"></h2>' +
      '<div class="seg" role="group"><button type="button" data-mode="connexion">Connexion</button><button type="button" data-mode="inscription">Inscription</button></div>' +
      '<div class="sso">' +
        '<button class="btn-discord" type="button">' + ICON.discord + 'Continuer avec Discord</button>' +
        '<div class="sso-google"></div>' +
        '<p class="sso-ou"><span>ou</span></p>' +
      '</div>' +
      '<form novalidate>' +
        '<label data-champ="pseudo">Pseudo<input name="pseudo" autocomplete="username" maxlength="24"></label>' +
        '<label>E-mail<input name="email" type="email" autocomplete="email" required></label>' +
        '<label>Mot de passe<input name="mdp" type="password" required></label>' +
        '<p class="form-err" role="alert"></p>' +
        '<button class="btn-login" type="submit"></button>' +
      "</form></div>";
    document.body.appendChild(fond);
    var form = fond.querySelector("form"), err = fond.querySelector(".form-err");
    var precedent = document.activeElement;

    function fermer() { document.removeEventListener("keydown", touche); fond.remove(); if (precedent && precedent.focus) precedent.focus(); }
    function touche(e) { if (e.key === "Escape") fermer(); }
    function regler(m) {
      mode = m; err.textContent = "";
      fond.querySelector("#modal-titre").textContent = m === "connexion" ? "Se connecter" : "Créer un compte";
      form.querySelector('[data-champ="pseudo"]').hidden = m === "connexion";
      form.mdp.autocomplete = m === "connexion" ? "current-password" : "new-password";
      form.querySelector(".btn-login").textContent = m === "connexion" ? "Se connecter" : "Créer mon compte";
      fond.querySelectorAll("[data-mode]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.mode === m ? "true" : "false"); });
    }
    document.addEventListener("keydown", touche);
    fond.addEventListener("mousedown", function (e) { if (e.target === fond) fermer(); });
    fond.querySelector(".modal-x").addEventListener("click", fermer);
    fond.querySelectorAll("[data-mode]").forEach(function (b) { b.addEventListener("click", function () { regler(b.dataset.mode); }); });

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pseudo = form.pseudo.value.trim(), email = form.email.value.trim(), mdp = form.mdp.value;
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { err.textContent = "Entre une adresse e-mail valide."; return; }
      if (mode === "inscription") {
        if (pseudo.length < 3) { err.textContent = "Le pseudo doit faire au moins 3 caractères."; return; }
        if (mdp.length < MIN) { err.textContent = "Le mot de passe doit faire au moins " + MIN + " caractères."; return; }
      } else if (!mdp) { err.textContent = "Entre ton mot de passe."; return; }
      if (!(window.crypto && crypto.subtle)) { err.textContent = "La connexion nécessite une page en HTTPS."; return; }
      var p = mode === "connexion" ? connecter(email, mdp) : inscrire(pseudo, email, mdp);
      p.then(function () { fermer(); majBouton(); }, function (m) { err.textContent = typeof m === "string" ? m : "Une erreur est survenue."; });
    });

    regler(mode);
    if (message) err.textContent = message;
    var gcible = fond.querySelector(".sso-google");
    fond.querySelector(".btn-discord").addEventListener("click", function () { var m = lancerDiscord(false); if (m) err.textContent = m; });
    if (CFG.googleClientId && apiBase()) {
      boutonGoogle(gcible, function (jeton) {
        // Connexion Google : le serveur vérifie le jeton et renvoie le profil
        fetch(apiBase() + "/api/session", { method: "POST", headers: { Authorization: "Google " + jeton } }).then(function (r) { if (!r.ok) throw 0; return r.json(); })
          .then(function () {
            var d = jwt(jeton);
            ecrire(CLE_SESSION, { pseudo: d.given_name || d.name || d.email, email: d.email || "", fournisseur: "google", id: "google:" + d.sub, jeton: jeton, avatar: d.picture || "" });
            fermer(); majBouton(); synchroniser();
          }, function () { err.textContent = "Connexion Google impossible. Réessaie."; });
      }, function (m) { err.textContent = m; });
    } else {
      gcible.innerHTML = GOOGLE_BTN;
      gcible.firstChild.addEventListener("click", function () { err.textContent = "Connexion Google pas encore configurée (googleClientId dans site.js)."; });
    }
    form.elements[mode === "connexion" ? "email" : "pseudo"].focus();
  }
  document.addEventListener("lni:ouvrir-connexion", function () { if (!utilisateur()) ouvrirModal("connexion"); });

  window.LNI_AUTH = {
    lierDiscord: function () { return lancerDiscord(true); },
    lierAvec: lierAvec,
    jwt: jwt,
    boutonGoogle: boutonGoogle,
    chargerGoogle: chargerGoogle,
    deconnecter: function () { deconnecter(); majBouton(); },
    synchroniser: synchroniser
  };

  majBouton();
  var retour = null;
  try { retour = retourDiscord(); } catch (e) {}
  if (retour) retour.then(function () { majBouton(); synchroniser(); }, function (m) { majBouton(); ouvrirModal("connexion", typeof m === "string" ? m : "Connexion Discord impossible."); });
  else synchroniser();
})();
