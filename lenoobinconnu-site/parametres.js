/* Page Paramètres : compte, connexions (Discord + Google sur le même profil), affichage, administration */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var $ = function (s) { return document.querySelector(s); };
  var $$ = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };
  var etat = { moi: null, profil: null, avatar: undefined, logo: undefined, reglages: null };
  var GOOGLE_SVG = '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23 12.3c0-.8-.1-1.5-.2-2.2H12v4.2h6.2a5.3 5.3 0 0 1-2.3 3.5v2.9h3.7c2.2-2 3.4-5 3.4-8.4z"/><path fill="#34A853" d="M12 24c3.1 0 5.7-1 7.6-2.8l-3.7-2.9c-1 .7-2.3 1.1-3.9 1.1-3 0-5.5-2-6.4-4.7H1.8v3A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.6 14.7a7.2 7.2 0 0 1 0-4.6v-3H1.8a12 12 0 0 0 0 10.6z"/><path fill="#EA4335" d="M12 4.8c1.7 0 3.2.6 4.4 1.7l3.3-3.3A11.9 11.9 0 0 0 12 0 12 12 0 0 0 1.8 7.1l3.8 3C6.5 6.8 9 4.8 12 4.8z"/></svg>';

  /* ----- Messages ----- */
  function msg(texte, ok) {
    var m = $(".pr-msg");
    m.hidden = !texte;
    m.textContent = texte || "";
    m.className = "pr-msg " + (ok ? "ok" : "err");
    if (texte) m.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function erreurTexte(e) { return typeof e === "string" ? e : (e && e.message) || "Une erreur est survenue."; }

  /* ----- Navigation entre sections ----- */
  function montrer(nom) {
    var bouton = document.querySelector('[data-section="' + nom + '"]');
    if (!bouton || bouton.hidden) nom = "compte";
    $$("[data-section]").forEach(function (b) { b.setAttribute("aria-current", b.dataset.section === nom ? "true" : "false"); });
    $$("[data-bloc]").forEach(function (s) { s.hidden = s.dataset.bloc !== nom; });
    try { history.replaceState(null, "", "#" + nom); } catch (e) {}
  }
  $$("[data-section]").forEach(function (b) { b.addEventListener("click", function () { montrer(b.dataset.section); }); });

  /* ----- Compte : pseudo, bio, photo ----- */
  function remplirCompte() {
    var form = $("#pr-form"), note = $("#pr-note-compte"), session = K.session() || {};
    var actif = K.connecte();
    ["pseudo", "bio"].forEach(function (c) { form.elements[c].disabled = !actif; });
    form.querySelector("button[type=submit]").disabled = !actif;
    $("#pr-fichier").disabled = !actif;
    $("#pr-retirer-photo").disabled = !actif;
    if (!actif) {
      note.textContent = "Connecte-toi avec Discord ou Google pour avoir un profil en ligne. Les comptes e-mail ne peuvent pas modifier leur profil en ligne.";
      return Promise.resolve();
    }
    // Valeurs de départ : la session, puis le profil du serveur dès qu'il répond
    if (!form.pseudo.value) form.pseudo.value = session.pseudo || "";
    apercuAvatar(session.avatar || "");
    return K.appel("GET", "/api/profil").then(function (p) {
      etat.profil = p;
      form.pseudo.value = p.pseudo || session.pseudo || "";
      form.bio.value = p.bio || "";
      apercuAvatar(p.avatar);
      $("#pr-lien-profil").href = "profil.html?id=" + encodeURIComponent(etat.moi ? etat.moi.id : "");
      $("#pr-lien-profil").hidden = !etat.moi;
      note.textContent = "";
    }, function (e) {
      note.textContent = "Impossible de charger ton profil : " + erreurTexte(e) + " (réessaie, ou vérifie que le Worker est à jour).";
    });
  }
  function apercuAvatar(url) {
    var a = url === undefined ? (etat.profil && etat.profil.avatar) : url;
    if (etat.avatar !== undefined) a = etat.avatar;
    $("#pr-apercu").innerHTML = a ? '<img src="' + K.esc(a) + '" alt="" referrerpolicy="no-referrer">' : '<svg class="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>';
  }

  // Photo carrée de 128 px
  function photoCarree(fichier) {
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
  $("#pr-fichier").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    photoCarree(f).then(function (d) { etat.avatar = d; apercuAvatar(); }, function () { msg("Impossible de lire cette image.", false); });
  });
  $("#pr-retirer-photo").addEventListener("click", function () { etat.avatar = ""; apercuAvatar(); });

  $("#pr-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, pseudo = f.pseudo.value.trim(), bio = f.bio.value.trim();
    if (pseudo.length < 3 || pseudo.length > 24) { msg("Le pseudo doit faire entre 3 et 24 caractères.", false); return; }
    var avatar = etat.avatar !== undefined ? etat.avatar : (etat.profil && etat.profil.avatar) || "";
    var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    K.appel("PUT", "/api/profil", { pseudo: pseudo, bio: bio, avatar: avatar }).then(function () {
      etat.avatar = undefined;
      if (window.LNI_AUTH) window.LNI_AUTH.synchroniser();
      msg("Profil enregistré.", true);
      return remplirCompte();
    }).then(function () { btn.disabled = false; }, function (er) { btn.disabled = false; msg(erreurTexte(er), false); });
  });

  /* ----- Connexions : Discord et Google sur le même profil ----- */
  function rendreConnexions() {
    var moi = etat.moi, connecte = K.connecte();
    var fs = (moi && moi.fournisseurs) || [], principal = moi && moi.principal;
    ["discord", "google"].forEach(function (f) {
      var ligne = document.querySelector('[data-f="' + f + '"]');
      var lie = fs.indexOf(f) >= 0;
      var nomF = f === "discord" ? "Discord" : "Google";
      var libelle = !lie ? "Non lié" : (principal === f ? "Identifiant principal de ton profil" : "Lié à ton profil");
      ligne.querySelector("[data-etat]").textContent = libelle;
      var act = ligne.querySelector(".pr-actions");
      act.innerHTML = "";
      if (!connecte) { act.innerHTML = '<span class="pr-note">Connecte-toi pour gérer les connexions.</span>'; return; }
      if (!lie) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "mini plein"; b.textContent = "Lier " + nomF;
        b.addEventListener("click", function () { if (f === "discord") lierDiscord(); else afficherGoogle(); });
        act.appendChild(b);
      } else if (principal !== f) {
        var d = document.createElement("button");
        d.type = "button"; d.className = "mini danger"; d.textContent = "Délier " + nomF;
        d.addEventListener("click", function () {
          if (!confirm("Délier " + nomF + " de ton profil ? Tu ne pourras plus te connecter avec ce compte à ce profil.")) return;
          K.appel("POST", "/api/delier", { fournisseur: f }).then(function () { msg(nomF + " délié.", true); return charger(); }, function (er) { msg(erreurTexte(er), false); });
        });
        act.appendChild(d);
      }
    });
    $("#pr-google-zone").hidden = true;
  }
  function lierDiscord() {
    var m = window.LNI_AUTH ? window.LNI_AUTH.lierDiscord() : "Connexion en cours de chargement, réessaie.";
    if (m) msg(m, false);
  }
  function afficherGoogle() {
    var zone = $("#pr-google-zone");
    zone.hidden = false;
    zone.innerHTML = '<p class="pr-note">Choisis le compte Google à lier à ton profil :</p><div class="sso-google pr-gbouton"></div>';
    var attendre = function () {
      if (!window.LNI_AUTH) return setTimeout(attendre, 200);
      window.LNI_AUTH.boutonGoogle(zone.querySelector(".pr-gbouton"), function (jeton) {
        window.LNI_AUTH.lierAvec("google", jeton).then(function () { msg("Compte Google lié.", true); charger(); }, function (er) { msg(erreurTexte(er), false); });
      }, function (m) { msg(m, false); });
    };
    attendre();
  }

  /* ----- Affichage : thème, musique ----- */
  function rendreAffichage() {
    if (!window.LNI_PREFS) return;
    var p = LNI_PREFS.get();
    $$("[data-theme-btn]").forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.themeBtn === p.theme ? "true" : "false"); });
    var dispo = ["ok", "chargement"].indexOf(LNI_PREFS.etat()) >= 0;
    $("#pr-musique").checked = dispo && p.musique;
    $("#pr-musique").disabled = !dispo;
    $("#pr-volume").disabled = !dispo;
    $("#pr-volume").value = Math.round(p.volume * 100);
    $("#pr-musique-etat").textContent = !dispo ? "Indisponible" : (p.musique ? "Activée" : "Désactivée");
    var note = $("#pr-musique-note"), e = LNI_PREFS.etat();
    note.hidden = e === "ok" || e === "chargement";
    note.textContent = e === "absent" ? "Aucun fichier de musique trouvé (assets/musique.mp3)." : "Aucune musique n'est configurée sur ce site.";
  }
  $$("[data-theme-btn]").forEach(function (b) { b.addEventListener("click", function () { LNI_PREFS.theme(b.dataset.themeBtn); rendreAffichage(); }); });
  $("#pr-musique").addEventListener("change", function () { LNI_PREFS.musique(this.checked); rendreAffichage(); });
  $("#pr-volume").addEventListener("input", function () { LNI_PREFS.volume(this.value / 100); });
  /* ----- Administration : maintenance, bandeau, fonctions, logo ----- */
  var PAGES = [["accueil", "Accueil"], ["programme", "Programme"], ["series", "Séries"], ["communaute", "Communauté"], ["affiliation", "Affiliation"], ["contact", "Contact"], ["mentions", "Mentions légales"], ["fil", "Fil"]];
  function remplirAdmin(r) {
    var m = r.maintenance || {}, a = r.annonce || {}, cb = r.chatbot || {}, pa = r.partenaires || {};
    var box = $("#adm-maint");
    box.innerHTML = PAGES.map(function (p) {
      return '<label class="coche"><input type="checkbox" name="m-' + p[0] + '"' + (m[p[0]] ? " checked" : "") + '> ' + K.esc(p[1]) + '</label>';
    }).join("");
    var f = $("#adm-form");
    f.elements["a-actif"].checked = a.actif !== undefined ? !!a.actif : !!(SITE.annonce && SITE.annonce.actif);
    f.elements["a-texte"].value = a.texte !== undefined ? a.texte : ((SITE.annonce && SITE.annonce.texte) || "");
    f.elements["a-lien"].value = a.lien || "";
    f.elements.chatbot.checked = cb.actif !== undefined ? !!cb.actif : !!(SITE.chatbot && SITE.chatbot.actif);
    f.elements.partenaires.checked = pa.afficher !== undefined ? !!pa.afficher : !(SITE.partenaires && SITE.partenaires.afficher === false);
    etat.logo = undefined;
    apercuLogo(r.logo);
  }
  function apercuLogo(url) {
    var a = etat.logo !== undefined ? etat.logo : url;
    $("#adm-logo-apercu").innerHTML = a ? '<img src="' + K.esc(a) + '" alt="Logo actuel">' : '<img src="' + K.esc(SITE.logo || "assets/logo.png") + '" alt="Logo actuel">';
  }
  // Logo : garde la transparence (WebP ou PNG), 400 px maximum
  function logoVersDataUrl(fichier) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onerror = ko;
      fr.onload = function () {
        var img = new Image();
        img.onerror = ko;
        img.onload = function () {
          var k = Math.min(1, 400 / Math.max(img.width, img.height));
          var c = document.createElement("canvas");
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          var url = c.toDataURL("image/webp", 0.9);
          if (url.length > 300000) return ko(new Error("Logo trop lourd."));
          ok(url);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(fichier);
    });
  }
  $("#adm-logo-fichier").addEventListener("change", function () {
    var f = this.files[0];
    if (!f) return;
    logoVersDataUrl(f).then(function (d) { etat.logo = d; apercuLogo(); }, function () { msg("Logo impossible à lire ou trop lourd (essaie une image plus petite).", false); });
  });
  $("#adm-logo-reset").addEventListener("click", function () { etat.logo = ""; apercuLogo(); });

  $("#adm-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var f = this, maint = {};
    PAGES.forEach(function (p) { maint[p[0]] = f.elements["m-" + p[0]].checked; });
    var corps = {
      maintenance: maint,
      annonce: { actif: f.elements["a-actif"].checked, texte: f.elements["a-texte"].value, lien: f.elements["a-lien"].value },
      chatbot: { actif: f.elements.chatbot.checked },
      partenaires: { afficher: f.elements.partenaires.checked }
    };
    if (etat.logo !== undefined) corps.logo = etat.logo;
    var btn = f.querySelector("button[type=submit]"); btn.disabled = true;
    K.appel("PUT", "/api/reglages", corps).then(function () {
      try { sessionStorage.setItem("lni_msg", "Réglages du site enregistrés."); } catch (e2) {}
      location.reload();
    }, function (er) { btn.disabled = false; msg(erreurTexte(er), false); });
  });

  /* ----- Chargement ----- */
  function charger() {
    var moiP = K.connecte() ? K.appel("GET", "/api/moi").then(function (d) { etat.moi = d; }, function () { etat.moi = null; }) : (etat.moi = null, Promise.resolve());
    return moiP.then(function () {
      var admin = !!(etat.moi && etat.moi.admin);
      $("#pr-lien-admin").hidden = !admin;
      rendreConnexions();
      rendreAffichage();
      return remplirCompte();
    }).then(function () {
      if (etat.moi && etat.moi.admin) {
        return K.appel("GET", "/api/reglages").then(remplirAdmin, function (er) { msg(erreurTexte(er), false); });
      }
    });
  }

  // Recharge seulement si la connexion a changé (sinon on effacerait la saisie en cours)
  var dernierJeton = (K.session() && K.session().jeton) || null;
  document.addEventListener("lni:session", function () {
    var j = (K.session() && K.session().jeton) || null;
    if (j !== dernierJeton) { dernierJeton = j; charger(); }
  });

  // Message laissé par une action précédente (liaison, enregistrement…)
  try {
    var m = sessionStorage.getItem("lni_msg");
    if (m) { sessionStorage.removeItem("lni_msg"); msg(m, true); }
  } catch (e) {}
  montrer((location.hash || "#compte").slice(1));
  charger();
})();
