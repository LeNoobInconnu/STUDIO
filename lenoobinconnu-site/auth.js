/* Système de connexion (comptes enregistrés dans le navigateur, mots de passe hachés PBKDF2).
   Pour de vrais comptes partagés entre appareils, remplace les fonctions de la section
   "Stockage" par des appels à ton serveur (Supabase, Firebase...). */
(function () {
  "use strict";
  var CLE_COMPTES = "lni_comptes", CLE_SESSION = "lni_session";
  var MIN = (SITE.connexion && SITE.connexion.motDePasseMin) || 8;
  var enc = new TextEncoder();

  /* ----- Stockage ----- */
  var SRV = window.LNI && window.LNI.sb ? window.LNI : null;
  function lire(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
  function ecrire(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function utilisateur() { return SRV ? SRV.user : lire(CLE_SESSION, null); }

  function hex(buf) { return Array.prototype.map.call(new Uint8Array(buf), function (b) { return ("0" + b.toString(16)).slice(-2); }).join(""); }
  function hash(mdp, sel) {
    return crypto.subtle.importKey("raw", enc.encode(mdp), "PBKDF2", false, ["deriveBits"]).then(function (cle) {
      return crypto.subtle.deriveBits({ name: "PBKDF2", salt: enc.encode(sel), iterations: 100000, hash: "SHA-256" }, cle, 256);
    }).then(hex);
  }

  function inscrire(pseudo, email, mdp) {
    if (SRV) {
      return SRV.sb.auth.signUp({ email: email, password: mdp, options: { data: { pseudo: pseudo }, emailRedirectTo: location.href.split("#")[0] } }).then(function (r) {
        if (r.error) throw r.error.message === "User already registered" ? "Un compte existe déjà avec cet e-mail." : r.error.message;
        if (!r.data.session) throw "Compte créé ! Vérifie ta boîte mail pour confirmer ton adresse, puis connecte-toi.";
      });
    }
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
    if (SRV) {
      return SRV.sb.auth.signInWithPassword({ email: email, password: mdp }).then(function (r) {
        if (r.error) throw /confirm/i.test(r.error.message) ? "Confirme d'abord ton adresse e-mail (regarde ta boîte mail)." : "E-mail ou mot de passe incorrect.";
      });
    }
    var a = lire(CLE_COMPTES, {})[email.toLowerCase()];
    if (!a) return Promise.reject("E-mail ou mot de passe incorrect.");
    return hash(mdp, a.sel).then(function (h) {
      if (h !== a.hash) throw "E-mail ou mot de passe incorrect.";
      ecrire(CLE_SESSION, { pseudo: a.pseudo, email: a.email, avatar: a.avatar || "" });
    });
  }
  var CFG = SITE.connexion || {};
  function urlRetour() { return CFG.urlRetour || new URL("index.html", location.href).href; }
  function ouvrirSession(u) { return ecrire(CLE_SESSION, u); }

  /* Discord (flux "implicit" : tout se passe dans le navigateur) */
  function lancerOAuth(fournisseur) {
    SRV.sb.auth.signInWithOAuth({ provider: fournisseur, options: { redirectTo: location.href.split("#")[0], scopes: fournisseur === "discord" ? "identify email" : undefined } });
    return "";
  }
  function lancerDiscord() {
    if (SRV) return lancerOAuth("discord");
    if (!CFG.discordClientId) return "Connexion Discord pas encore configurée (discordClientId dans site.js).";
    var st = hex(crypto.getRandomValues(new Uint8Array(16)));
    try { sessionStorage.setItem("lni_oauth_state", st); sessionStorage.setItem("lni_oauth_page", location.href.split("#")[0]); } catch (e) {}
    location.href = "https://discord.com/oauth2/authorize?response_type=token&client_id=" + encodeURIComponent(CFG.discordClientId) +
      "&scope=" + encodeURIComponent("identify email") + "&redirect_uri=" + encodeURIComponent(urlRetour()) + "&state=" + st;
    return "";
  }
  function retourDiscord() {
    var h = new URLSearchParams(location.hash.slice(1));
    if (!h.get("access_token") || !h.get("state")) return null;
    var attendu = null, page = null;
    try { attendu = sessionStorage.getItem("lni_oauth_state"); page = sessionStorage.getItem("lni_oauth_page"); sessionStorage.removeItem("lni_oauth_state"); } catch (e) {}
    history.replaceState(null, "", location.pathname + location.search);
    if (!attendu || attendu !== h.get("state")) return Promise.reject("Connexion Discord refusée (état invalide).");
    return fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + h.get("access_token") } })
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(function (d) {
        ouvrirSession({ pseudo: d.global_name || d.username, email: d.email || "", fournisseur: "discord", id: "discord:" + d.id, jeton: h.get("access_token"),
          avatar: d.avatar ? "https://cdn.discordapp.com/avatars/" + d.id + "/" + d.avatar + ".png?size=64" : "" });
        if (page && page !== location.href.split("#")[0]) location.href = page;
      }, function () { throw "Impossible de récupérer ton profil Discord."; });
  }

  /* Google (Google Identity Services) */
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
  function boutonGoogle(cible, surSucces, surErreur) {
    chargerGoogle().then(function () {
      google.accounts.id.initialize({ client_id: CFG.googleClientId, callback: function (r) {
        try {
          var d = jwt(r.credential);
          ouvrirSession({ pseudo: d.given_name || d.name || d.email, email: d.email || "", fournisseur: "google", id: "google:" + d.sub, jeton: r.credential, avatar: d.picture || "" });
          surSucces();
        } catch (e) { surErreur("Connexion Google impossible."); }
      } });
      google.accounts.id.renderButton(cible, { theme: "outline", size: "large", text: "continue_with", shape: "rectangular", width: cible.clientWidth || 364, locale: "fr" });
    }, function () { surErreur("Impossible de charger Google (bloqueur de pub ?)."); });
  }

  function deconnecter() {
    if (SRV) return SRV.sb.auth.signOut();
    try { localStorage.removeItem(CLE_SESSION); } catch (e) {}
  }

  /* ----- Interface ----- */
  var btns = Array.prototype.slice.call(document.querySelectorAll(".js-compte"));
  if (!btns.length) return;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
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
    var wrap = btn.parentNode;
    var u = utilisateur();
    if (!u) { ouvrirModal("connexion"); return; }
    if (menu) { fermerMenu(); return; }
    menu = document.createElement("div");
    menu.className = "compte-menu";
    menu.innerHTML = "<p>Connecté" + (u.fournisseur ? " via " + (u.fournisseur === "google" ? "Google" : "Discord") : "") + (u.email ? " : " + esc(u.email) : "") + '</p>' + (u.id && SITE.actualites && SITE.actualites.urlApi ? '<p class="compte-id">ID admin : <code>' + esc(u.id) + '</code></p>' : "") + '<button type="button" class="js-profil">' + ICON.user + "Modifier mon profil</button>" + '<button type="button" class="js-logout">' + ICON.logout + "Se déconnecter</button>";
    if (SRV && SRV.admin) {
      var a = document.createElement("a");
      a.href = "admin.html"; a.className = "compte-lien"; a.innerHTML = ICON.news + "Administration";
      menu.insertBefore(a, menu.querySelector(".js-profil"));
    }
    menu.querySelector(".js-logout").addEventListener("click", function () { Promise.resolve(deconnecter()).then(function () { fermerMenu(); majBouton(); }); });
    var bp = menu.querySelector(".js-profil");
    if (SRV) bp.remove(); else bp.addEventListener("click", function () { fermerMenu(); ouvrirProfil(); });
    wrap.appendChild(menu);
    document.dispatchEvent(new CustomEvent("lni:menu-compte", { detail: { menu: menu, user: u } }));
  }
  document.addEventListener("click", function (e) { if (menu && !e.target.closest(".compte-wrap")) fermerMenu(); });

  /* ----- Profil (pseudo et photo) ----- */
  function apiProfil() { return SITE.actualites && SITE.actualites.urlApi ? SITE.actualites.urlApi.replace(/\/+$/, "") + "/api/profil" : ""; }
  function enteteJeton(u) { return u.jeton ? { Authorization: (u.fournisseur === "google" ? "Google " : "Discord ") + u.jeton } : null; }

  // Reprend le profil enregistré sur le serveur (il passe avant le nom Discord / Google)
  function appliquerProfil() {
    var u = utilisateur(), url = apiProfil(), h = u && enteteJeton(u);
    if (!url || !h) return;
    fetch(url, { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
      if (!d || !d.pseudo) return;
      var u2 = utilisateur();
      if (!u2 || u2.id !== u.id) return;
      var avatar = typeof d.avatar === "string" ? d.avatar : u2.avatar;
      if (u2.pseudo === d.pseudo && u2.avatar === avatar) return;
      u2.pseudo = d.pseudo; u2.avatar = avatar;
      ecrire(CLE_SESSION, u2); majBouton();
    }).catch(function () {});
  }

  // Photo carrée de 128 px, en JPEG léger
  function redimensionner(fichier) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onerror = ko;
      fr.onload = function () {
        var img = new Image();
        img.onerror = ko;
        img.onload = function () {
          var c = document.createElement("canvas"); c.width = c.height = 128;
          var m = Math.min(img.width, img.height);
          c.getContext("2d").drawImage(img, (img.width - m) / 2, (img.height - m) / 2, m, m, 0, 0, 128, 128);
          ok(c.toDataURL("image/jpeg", 0.8));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(fichier);
    });
  }

  function ouvrirProfil() {
    var u = utilisateur();
    if (!u) return;
    document.dispatchEvent(new Event("lni:modal"));
    var avatar = u.avatar || "";
    var fond = document.createElement("div");
    fond.className = "modal-fond";
    fond.innerHTML = '<div class="modal" role="dialog" aria-modal="true" aria-labelledby="profil-titre">' +
      '<button class="modal-x" type="button" aria-label="Fermer">' + ICON.close + '</button>' +
      '<h2 id="profil-titre">Mon profil</h2>' +
      '<form novalidate>' +
        '<div class="profil-photo"><span class="profil-apercu"></span><div>' +
          '<label class="mini profil-choisir">Changer la photo<input type="file" accept="image/*" hidden></label>' +
          '<button class="mini" type="button" data-retirer>Retirer</button></div></div>' +
        '<label>Pseudo<input name="pseudo" maxlength="24" autocomplete="nickname"></label>' +
        '<p class="form-err" role="alert"></p>' +
        '<button class="btn-login" type="submit">Enregistrer</button>' +
      '</form></div>';
    document.body.appendChild(fond);
    var form = fond.querySelector("form"), err = fond.querySelector(".form-err"), apercu = fond.querySelector(".profil-apercu");
    form.pseudo.value = u.pseudo || "";
    function maj() { apercu.innerHTML = avatar ? '<img src="' + esc(avatar) + '" alt="" referrerpolicy="no-referrer">' : ICON.user; }
    maj();
    function fermer() { document.removeEventListener("keydown", touche); fond.remove(); }
    function touche(e) { if (e.key === "Escape") fermer(); }
    document.addEventListener("keydown", touche);
    fond.addEventListener("mousedown", function (e) { if (e.target === fond) fermer(); });
    fond.querySelector(".modal-x").addEventListener("click", fermer);
    fond.querySelector("[data-retirer]").addEventListener("click", function () { avatar = ""; maj(); });
    fond.querySelector("input[type=file]").addEventListener("change", function () {
      var f = this.files[0];
      if (!f) return;
      redimensionner(f).then(function (d) { avatar = d; maj(); err.textContent = ""; }, function () { err.textContent = "Impossible de lire cette image."; });
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var pseudo = form.pseudo.value.trim();
      if (pseudo.length < 3 || pseudo.length > 24) { err.textContent = "Le pseudo doit faire entre 3 et 24 caractères."; return; }
      var btn = form.querySelector(".btn-login"); btn.disabled = true;
      var h = enteteJeton(u), url = apiProfil();
      var envoi = h && url
        ? fetch(url, { method: "PUT", headers: { Authorization: h.Authorization, "Content-Type": "application/json" }, body: JSON.stringify({ pseudo: pseudo, avatar: avatar }) })
            .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw r.status === 401 ? "Ta connexion a expiré : déconnecte-toi puis reconnecte-toi." : (d.erreur || "Erreur du serveur"); }); })
        : Promise.resolve();
      envoi.then(function () {
        var s = utilisateur() || u;
        s.pseudo = pseudo; s.avatar = avatar;
        ecrire(CLE_SESSION, s);
        if (!h) { var c = lire(CLE_COMPTES, {}), a = c[(s.email || "").toLowerCase()]; if (a) { a.pseudo = pseudo; a.avatar = avatar; ecrire(CLE_COMPTES, c); } }
        fermer(); majBouton();
      }, function (m) { btn.disabled = false; err.textContent = typeof m === "string" ? m : "Impossible d'enregistrer pour le moment."; });
    });
    form.pseudo.focus();
  }

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
    var sso = fond.querySelector(".sso"), gcible = fond.querySelector(".sso-google");
    fond.querySelector(".btn-discord").addEventListener("click", function () { var m = lancerDiscord(); if (m) err.textContent = m; });
    if (SRV) {
      gcible.innerHTML = GOOGLE_BTN;
      gcible.firstChild.addEventListener("click", function () { lancerOAuth("google"); });
    } else if (CFG.googleClientId) {
      boutonGoogle(gcible, function () { fermer(); majBouton(); appliquerProfil(); }, function (m) { err.textContent = m; });
    } else {
      gcible.innerHTML = GOOGLE_BTN;
      gcible.firstChild.addEventListener("click", function () { err.textContent = "Connexion Google pas encore configurée (googleClientId dans site.js)."; });
    }
    form.elements[mode === "connexion" ? "email" : "pseudo"].focus();
  }
  document.addEventListener("lni:ouvrir-connexion", function () { if (!utilisateur()) ouvrirModal("connexion"); });
  if (SRV) { document.addEventListener("lni:auth", majBouton); majBouton(); return; }
  window.LNI_AUTH = { deconnecter: function () { deconnecter(); majBouton(); } };
  var retour = null;
  try { retour = retourDiscord(); } catch (e) {}
  majBouton();
  appliquerProfil();
  if (retour) retour.then(function () { majBouton(); appliquerProfil(); }, function (m) { majBouton(); ouvrirModal("connexion", typeof m === "string" ? m : "Connexion Discord impossible."); });
})();
