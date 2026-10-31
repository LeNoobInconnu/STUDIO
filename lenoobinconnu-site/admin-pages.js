/* Pages séparées de l'administration : utilisateurs, thème et musique */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var section = document.body.getAttribute("data-admin-section");
  var contenu = document.getElementById("adm-page-content");
  var profil = document.getElementById("adm-page-user");
  var suivant = null;
  var chargement = false;
  var dateFR = function (t) {
    try { return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return "Date inconnue"; }
  };

  function afficherMessage(el, texte, ok) {
    el.hidden = !texte;
    el.textContent = texte || "";
    el.className = "adm-page-msg " + (ok ? "ok" : "err");
  }

  function refuser(texte, connexion) {
    contenu.innerHTML = '<section class="adm-page-card adm-page-login"><h1>Espace administrateur</h1><p>' + K.esc(texte) + '</p>' +
      (connexion ? '<button class="btn-login" id="adm-page-login" type="button">Se connecter</button>' : '<a class="btn-login" href="admin.html">Retour au tableau de bord</a>') +
      '</section>';
    var bouton = document.getElementById("adm-page-login");
    if (bouton) bouton.addEventListener("click", K.ouvrirConnexion);
    document.getElementById("adm-page-logout").hidden = !connexion;
  }

  function rendreProfil(moi) {
    var session = K.session() || {};
    profil.innerHTML = (moi.avatar || session.avatar
      ? '<img src="' + K.esc(moi.avatar || session.avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="ini">' + K.esc((moi.nom || "?").charAt(0).toUpperCase()) + '</span>') +
      '<div style="min-width:0"><strong>' + K.esc(moi.nom || session.pseudo || "Administrateur") + '</strong><small>Administrateur</small></div>';
  }

  function rendreUtilisateurs(utilisateurs, ajouter) {
    var liste = document.getElementById("adm-users-list");
    if (!ajouter) liste.innerHTML = "";
    if (!utilisateurs.length && !ajouter) {
      liste.innerHTML = '<li>Aucun compte serveur enregistré pour le moment.</li>';
      return;
    }
    liste.insertAdjacentHTML("beforeend", utilisateurs.map(function (u) {
      var fournisseurs = (u.fournisseurs || []).join(", ") || "Non précisé";
      var date = u.inscritLe ? dateFR(u.inscritLe) : "Date d’inscription non renseignée";
      var resume = [u.pseudo, u.id, u.bio, fournisseurs, u.admin ? "admin" : ""].join(" ").toLowerCase();
      return '<li data-q="' + K.esc(resume) + '">' + K.avatar(u.avatar, "av") +
        '<div class="txt"><strong>' + K.esc(u.pseudo || "Joueur") + (u.admin ? " · Administrateur" : "") + '</strong>' +
        '<span>' + K.esc(u.bio || "Aucune bio") + '</span>' +
        '<small>' + K.esc(fournisseurs) + ' · ' + K.esc(date) + '</small>' +
        '<small>' + (u.publications || 0) + ' publication(s) · ' + (u.abonnes || 0) + ' abonné(s) · ' + (u.abonnements || 0) + ' abonnement(s)</small>' +
        '<small>ID : ' + K.esc(u.id) + '</small></div></li>';
    }).join(""));
  }

  function chargerUtilisateurs(curseur, ajouter) {
    if (chargement) return;
    chargement = true;
    var bouton = document.getElementById("adm-users-more");
    var note = document.getElementById("adm-users-message");
    bouton.disabled = true;
    K.appel("GET", "/api/admin/utilisateurs" + (curseur ? "?cursor=" + encodeURIComponent(curseur) : "")).then(function (d) {
      rendreUtilisateurs(d.utilisateurs || [], ajouter);
      suivant = d.curseur || null;
      bouton.hidden = !suivant;
      afficherMessage(note, "", true);
    }, function (e) {
      afficherMessage(note, "Impossible de charger les utilisateurs : " + e.message, false);
      bouton.hidden = true;
    }).then(function () {
      chargement = false;
      bouton.disabled = false;
    });
  }

  function initialiserUtilisateurs() {
    document.getElementById("adm-users-search").addEventListener("input", function () {
      var q = this.value.trim().toLowerCase();
      document.querySelectorAll("#adm-users-list li[data-q]").forEach(function (item) {
        item.hidden = !!q && item.getAttribute("data-q").indexOf(q) < 0;
      });
    });
    document.getElementById("adm-users-more").addEventListener("click", function () {
      if (suivant) chargerUtilisateurs(suivant, true);
    });
    chargerUtilisateurs(null, false);
  }

  function initialiserTheme(reglages) {
    var form = document.getElementById("adm-theme-form");
    var note = document.getElementById("adm-theme-message");
    var defauts = reglages.reglagesParDefaut || SITE.reglagesParDefaut || {};
    form.elements.theme.value = defauts.theme === "sombre" ? "sombre" : "normal";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      K.appel("PUT", "/api/reglages", {
        reglagesParDefaut: { theme: form.elements.theme.value }
      }).then(function () {
        afficherMessage(note, "Thème par défaut enregistré.", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’enregistrer le thème : " + erreur.message, false);
      }).then(function () { bouton.disabled = false; });
    });
  }

  function initialiserMaintenance(reglages) {
    var pages = [
      ["accueil", "Accueil"],
      ["programme", "Programme"],
      ["series", "Séries"],
      ["communaute", "Communauté"],
      ["fil", "Fil de publications"],
      ["affiliation", "Affiliation"],
      ["contact", "Contact"],
      ["mentions", "Mentions légales"],
      ["profil", "Profil public"],
      ["parametres", "Paramètres du compte"]
    ];
    var form = document.getElementById("adm-maintenance-form");
    var zone = document.getElementById("adm-maintenance-pages");
    var note = document.getElementById("adm-maintenance-message");
    var actives = reglages.maintenance || SITE.maintenance || {};
    zone.innerHTML = pages.map(function (page) {
      return '<label><input type="checkbox" name="page-' + page[0] + '"' + (actives[page[0]] ? " checked" : "") + '> ' + page[1] + '</label>';
    }).join("");
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var maintenance = {};
      pages.forEach(function (page) {
        maintenance[page[0]] = form.elements["page-" + page[0]].checked;
      });
      var bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      K.appel("PUT", "/api/reglages", { maintenance: maintenance }).then(function () {
        afficherMessage(note, "Réglages de maintenance enregistrés. Les visiteurs verront le changement à leur prochaine visite.", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’enregistrer la maintenance : " + erreur.message, false);
      }).then(function () { bouton.disabled = false; });
    });
  }

  function initialiserMusique(reglages) {
    var form = document.getElementById("adm-music-form");
    var select = form.elements.fichier;
    var lecteur = document.getElementById("adm-music-preview");
    var note = document.getElementById("adm-music-message");
    var pistes = (SITE.musiquesDisponibles || []).filter(function (p) {
      return p && typeof p.fichier === "string" && /^(?:assets\/[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp3$/.test(p.fichier);
    });
    var reglagesMusique = reglages.musique || {};
    var courant = reglagesMusique.fichier || (SITE.musique && SITE.musique.fichier) || "";

    pistes.forEach(function (piste) {
      var option = document.createElement("option");
      option.value = piste.fichier;
      option.textContent = piste.nom || piste.fichier;
      select.appendChild(option);
    });
    if (courant && !pistes.some(function (piste) { return piste.fichier === courant; })) {
      var optionCourante = document.createElement("option");
      optionCourante.value = courant;
      optionCourante.textContent = courant + " (non listée)";
      select.appendChild(optionCourante);
    }
    if (courant) select.value = courant;
    if (!select.options.length) {
      select.disabled = true;
      form.querySelector('button[type="submit"]').disabled = true;
      afficherMessage(note, "Aucun fichier musical configuré dans site.js.", false);
    }
    lecteur.src = select.value || "";
    form.elements.musique.checked = !!(reglages.reglagesParDefaut || SITE.reglagesParDefaut || {}).musique;
    select.addEventListener("change", function () { lecteur.src = this.value; lecteur.load(); });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      K.appel("PUT", "/api/reglages", {
        reglagesParDefaut: { musique: form.elements.musique.checked },
        musique: { fichier: select.value }
      }).then(function () {
        afficherMessage(note, "Musique par défaut enregistrée.", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’enregistrer la musique : " + erreur.message, false);
      }).then(function () { bouton.disabled = false; });
    });
  }

  document.getElementById("adm-page-logout").addEventListener("click", function () {
    if (window.LNI_AUTH) window.LNI_AUTH.deconnecter();
    else {
      try { localStorage.removeItem("lni_session"); } catch (e) {}
    }
    location.href = "index.html";
  });

  if (!K.connecte()) {
    refuser("Connecte-toi avec un compte administrateur pour accéder à cette page.", true);
    return;
  }

  K.appel("GET", "/api/moi").then(function (moi) {
    if (!moi.admin) {
      refuser("Cette page est réservée aux administrateurs.", false);
      return null;
    }
    rendreProfil(moi);
    if (section === "utilisateurs") initialiserUtilisateurs();
    else {
      return K.appel("GET", "/api/reglages").then(function (reglages) {
        if (section === "theme") initialiserTheme(reglages);
        else if (section === "musique") initialiserMusique(reglages);
        else if (section === "maintenance") initialiserMaintenance(reglages);
      });
    }
  }).catch(function (e) {
    refuser("Impossible de vérifier les droits ou de charger les réglages : " + e.message + ". Reconnecte-toi puis réessaie.", false);
  });
})();
