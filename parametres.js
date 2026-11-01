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

  /* ----- Compte : profil local ou profil en ligne ----- */
  function remplirCompte() {
    var form = $("#pr-form"), note = $("#pr-note-compte"), session = K.session() || {};
    var auth = window.LNI_AUTH, local = !!(auth && auth.compteLocalActuel && auth.compteLocalActuel());
    var actif = K.connecte() || local;
    ["pseudo", "bio"].forEach(function (c) { form.elements[c].disabled = !actif; });
    form.querySelector("button[type=submit]").disabled = !actif;
    $("#pr-fichier").disabled = !actif;
    $("#pr-retirer-photo").disabled = !actif;
    $("#pr-profil-public").disabled = !K.connecte();
    $("#pr-verification-form").hidden = !K.connecte();
    $("#pr-email-form").hidden = !local;
    $("#pr-password-form").hidden = !local;
    $("#pr-exporter").disabled = !actif;
    $("#pr-desactiver").disabled = !actif;
    $("#pr-note-visibilite").textContent = local
      ? "Les comptes e-mail sont enregistrés uniquement dans ce navigateur : leur profil ne peut pas être publié en ligne."
      : (K.connecte() ? "" : "Connecte-toi pour régler la visibilité de ton profil.");
    $("#pr-identifiants-note").textContent = local
      ? "Ce compte e-mail est stocké dans ce navigateur. Un changement d’adresse ou de mot de passe ne le synchronise pas avec d’autres appareils."
      : (K.connecte() ? "L’adresse e-mail et le mot de passe des comptes Google ou Discord se gèrent auprès de leur fournisseur." : "Connecte-toi pour gérer tes identifiants.");
    if (!actif) {
      note.textContent = "Connecte-toi pour modifier ton profil et gérer les données de ton compte.";
      return Promise.resolve();
    }
    if (local) {
      etat.profil = auth.profilLocal();
      form.pseudo.value = etat.profil.pseudo || "";
      form.bio.value = etat.profil.bio || "";
      apercuAvatar(etat.profil.avatar || "");
      $("#pr-lien-profil").hidden = true;
      note.textContent = "Profil local à cet appareil, non visible publiquement.";
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
      $("#pr-profil-public").checked = etat.compteOptions ? etat.compteOptions.profilPublic !== false : true;
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
    var auth = window.LNI_AUTH;
    var sauvegarde = auth && auth.compteLocalActuel()
      ? auth.sauverProfilLocal({ pseudo: pseudo, bio: bio, avatar: avatar })
      : K.appel("PUT", "/api/profil", { pseudo: pseudo, bio: bio, avatar: avatar });
    sauvegarde.then(function () {
      etat.avatar = undefined;
      if (window.LNI_AUTH) window.LNI_AUTH.synchroniser();
      msg("Profil enregistré.", true);
      return remplirCompte();
    }).then(function () { btn.disabled = false; }, function (er) { btn.disabled = false; msg(erreurTexte(er), false); });
  });

  /* ----- Confidentialité, vérification, export et désactivation ----- */
  var PREFS_DEFAUT = {
    emailConnexion: true, emailSecurite: true, navigateur: false, mobile: false, discord: false,
    nouveautes: true, evenements: true, messages: true, commentaires: true, silencieux: false
  };
  var CLE_PREFS_LOCALES = "lni_preferences_notifications";
  function preferencesDepuisFormulaire() {
    var prefs = {};
    Object.keys(PREFS_DEFAUT).forEach(function (cle) { prefs[cle] = $("#pr-notifications-form").elements[cle].checked; });
    return prefs;
  }
  function afficherPreferences(prefs) {
    prefs = prefs || {};
    Object.keys(PREFS_DEFAUT).forEach(function (cle) {
      $("#pr-notifications-form").elements[cle].checked = prefs[cle] === undefined ? PREFS_DEFAUT[cle] : !!prefs[cle];
    });
  }
  function chargerCompteOptions() {
    var auth = window.LNI_AUTH, local = !!(auth && auth.compteLocalActuel());
    if (K.connecte()) {
      etat.compteOptions = null;
      return K.appel("GET", "/api/mon-compte").then(function (d) {
        etat.compteOptions = d;
        $("#pr-profil-public").checked = d.profilPublic !== false;
        afficherPreferences(d.preferences);
        var demande = d.demandeVerification;
        $("#pr-verification-status").textContent = demande
          ? (demande.traiteeLe ? (demande.acceptee ? "Ta demande a été acceptée." : "Ta demande n’a pas été acceptée.") : "Une demande est déjà en attente depuis le " + new Date(demande.date).toLocaleDateString("fr-FR") + ".")
          : "La demande sera examinée par un administrateur.";
        $("#pr-verification-submit").disabled = !!(demande && !demande.traiteeLe);
      }, function (e) {
        $("#pr-notifications-status").textContent = "Impossible de charger les préférences du compte : " + erreurTexte(e);
      });
    }
    etat.compteOptions = null;
    if (local) {
      try { afficherPreferences(JSON.parse(localStorage.getItem(CLE_PREFS_LOCALES)) || {}); }
      catch (e) { afficherPreferences({}); }
      $("#pr-verification-status").textContent = "La vérification est disponible uniquement pour les comptes en ligne.";
      $("#pr-verification-submit").disabled = true;
    } else {
      afficherPreferences({});
      $("#pr-verification-status").textContent = "Connecte-toi avec Discord ou Google pour demander une vérification.";
      $("#pr-verification-submit").disabled = true;
    }
    return Promise.resolve();
  }
  $("#pr-profil-public").addEventListener("change", function () {
    var controle = this, valeur = controle.checked;
    if (!K.connecte()) { controle.checked = !valeur; return; }
    controle.disabled = true;
    K.appel("PUT", "/api/mon-compte", { profilPublic: valeur }).then(function () {
      if (etat.compteOptions) etat.compteOptions.profilPublic = valeur;
      $("#pr-note-visibilite").textContent = valeur ? "Ton profil est visible publiquement." : "Ton profil est masqué aux autres visiteurs.";
    }, function (e) {
      controle.checked = !valeur;
      msg("Impossible de modifier la visibilité : " + erreurTexte(e), false);
    }).then(function () { controle.disabled = false; }, function () { controle.disabled = false; });
  });
  $("#pr-notifications-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var prefs = preferencesDepuisFormulaire(), status = $("#pr-notifications-status"), auth = window.LNI_AUTH;
    var local = !!(auth && auth.compteLocalActuel()), btn = this.querySelector("button[type=submit]");
    btn.disabled = true;
    var sauver;
    if (K.connecte()) sauver = K.appel("PUT", "/api/mon-compte", { preferences: prefs });
    else {
      try { localStorage.setItem(CLE_PREFS_LOCALES, JSON.stringify(prefs)); sauver = Promise.resolve(); }
      catch (er) { sauver = Promise.reject("Impossible d’enregistrer les préférences dans ce navigateur."); }
    }
    sauver.then(function () {
      status.textContent = "Préférences enregistrées. Aucun envoi de notification n’est activé pour l’instant.";
      if (etat.compteOptions) etat.compteOptions.preferences = prefs;
    }, function (er) { status.textContent = "Échec de l’enregistrement : " + erreurTexte(er); })
      .then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
  });
  $("#pr-verification-form").addEventListener("submit", function (e) {
    e.preventDefault();
    if (!K.connecte()) { msg("Connecte-toi avec Discord ou Google pour demander une vérification.", false); return; }
    var form = this, btn = $("#pr-verification-submit");
    btn.disabled = true;
    K.appel("POST", "/api/verification", { note: form.elements.note.value.trim() }).then(function () {
      form.elements.note.value = "";
      $("#pr-verification-status").textContent = "Demande envoyée. Un administrateur la vérifiera.";
      msg("Demande de vérification envoyée.", true);
      return chargerCompteOptions();
    }, function (er) {
      btn.disabled = false;
      msg(erreurTexte(er), false);
    });
  });
  function telechargerJson(donnees, nom) {
    var url = URL.createObjectURL(new Blob([JSON.stringify(donnees, null, 2)], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url; a.download = nom; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }
  $("#pr-exporter").addEventListener("click", function () {
    var bouton = this, auth = window.LNI_AUTH;
    bouton.disabled = true;
    var exporter = K.connecte() ? K.appel("GET", "/api/mon-compte/export")
      : (auth && auth.exporterCompteLocal ? auth.exporterCompteLocal() : Promise.reject("Connecte-toi pour exporter tes données."));
    exporter.then(function (d) {
      telechargerJson(d, "mes-donnees-lni.json");
      msg("Export téléchargé. Il contient les données disponibles pour ce type de compte.", true);
    }, function (e) { msg("Impossible d’exporter les données : " + erreurTexte(e), false); })
      .then(function () { bouton.disabled = false; }, function () { bouton.disabled = false; });
  });
  $("#pr-desactiver").addEventListener("click", function () {
    if (!window.confirm("Désactiver temporairement ton compte ? Tu seras déconnecté. Tu pourras le réactiver en te reconnectant.")) return;
    var bouton = this, auth = window.LNI_AUTH, local = !!(auth && auth.compteLocalActuel());
    bouton.disabled = true;
    var desactiver = local ? auth.desactiverCompteLocal() : K.appel("PUT", "/api/mon-compte", { desactive: true });
    desactiver.then(function () {
      if (!local && auth) auth.deconnecter();
      msg("Compte désactivé. Reconnecte-toi pour le réactiver.", true);
      setTimeout(function () { location.href = "index.html"; }, 900);
    }, function (e) {
      bouton.disabled = false;
      msg("Impossible de désactiver le compte : " + erreurTexte(e), false);
    });
  });
  $("#pr-email-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = this, btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    window.LNI_AUTH.changerEmailLocal(form.elements.email.value, form.elements.currentPassword.value).then(function () {
      form.reset(); msg("Adresse e-mail modifiée sur cet appareil.", true); return remplirCompte();
    }, function (er) { msg(erreurTexte(er), false); })
      .then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
  });
  $("#pr-password-form").addEventListener("submit", function (e) {
    e.preventDefault();
    var form = this, btn = form.querySelector("button[type=submit]");
    if (form.elements.newPassword.value !== form.elements.confirmPassword.value) { msg("Les deux nouveaux mots de passe ne correspondent pas.", false); return; }
    btn.disabled = true;
    window.LNI_AUTH.changerMotDePasseLocal(form.elements.currentPassword.value, form.elements.newPassword.value).then(function () {
      form.reset(); msg("Mot de passe modifié pour ce compte local.", true);
    }, function (er) { msg(erreurTexte(er), false); })
      .then(function () { btn.disabled = false; }, function () { btn.disabled = false; });
  });

  /* ----- Connexions : Discord et Google sur le même profil ----- */
  function rendreConnexions() {
    var moi = etat.moi, connecte = K.connecte();
    var compteLocal = window.LNI_AUTH && window.LNI_AUTH.compteLocalActuel && window.LNI_AUTH.compteLocalActuel();
    var fs = (moi && moi.fournisseurs) || [], principal = moi && moi.principal;
    ["discord", "google"].forEach(function (f) {
      var ligne = document.querySelector('[data-f="' + f + '"]');
      var lie = fs.indexOf(f) >= 0;
      var nomF = f === "discord" ? "Discord" : "Google";
      var libelle = !lie ? "Non lié" : (principal === f ? "Identifiant principal de ton profil" : "Lié à ton profil");
      ligne.querySelector("[data-etat]").textContent = libelle;
      var act = ligne.querySelector(".pr-actions");
      act.innerHTML = "";
      if (!connecte) {
        act.innerHTML = '<span class="pr-note">' + (compteLocal
          ? "Les comptes e-mail locaux ne peuvent pas lier Discord ou Google."
          : "Connecte-toi pour gérer les connexions.") + '</span>';
        return;
      }
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
  var PAGES = [["accueil", "Accueil"], ["programme", "Programme"], ["series", "Séries"], ["communaute", "Communauté"], ["affiliation", "Affiliation"], ["contact", "Contact"], ["mentions", "Mentions légales"], ["fil", "Fil"], ["profil", "Profil public"], ["parametres", "Paramètres du compte"]];
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
      return Promise.all([remplirCompte(), chargerCompteOptions()]);
    }).then(function () {
      if (etat.moi && etat.moi.admin) {
        return K.appel("GET", "/api/reglages").then(remplirAdmin, function (er) { msg(erreurTexte(er), false); });
      }
    });
  }

  // Recharge seulement si la connexion a changé (sinon on effacerait la saisie en cours)
  var derniereSession = (K.session() && (K.session().jeton || K.session().email)) || null;
  document.addEventListener("lni:session", function () {
    var session = K.session() || {}, identifiant = session.jeton || session.email || null;
    if (identifiant !== derniereSession) { derniereSession = identifiant; charger(); }
  });
  document.addEventListener("lni:auth-ready", function () { charger(); });

  // Message laissé par une action précédente (liaison, enregistrement…)
  try {
    var m = sessionStorage.getItem("lni_msg");
    if (m) { sessionStorage.removeItem("lni_msg"); msg(m, true); }
  } catch (e) {}
  montrer((location.hash || "#compte").slice(1));
  charger();
})();
