/* Pages séparées de l'administration : utilisateurs, thème et musique */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var section = document.body.getAttribute("data-admin-section");
  var contenu = document.getElementById("adm-page-content");
  var profil = document.getElementById("adm-page-user");
  var suivant = null;
  var chargement = false;
  var utilisateursCharges = [];
  var chargementExport = false;
  var chargementRecherche = false;
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
      var comptes = u.comptes || [];
      var emails = comptes.filter(function (c) { return c.email; }).map(function (c) {
        return c.fournisseur + (c.nom ? " (" + c.nom + ")" : "") + " · " + c.email + (c.verifie ? " · vérifié" : " · non vérifié");
      }).join(" | ") || "Adresse e-mail indisponible";
      var identites = comptes.map(function (c) {
        return c.fournisseur + (c.nom ? " : " + c.nom : "") + (c.identifiant ? " · ID " + c.identifiant : "");
      }).join(" | ") || "Aucun fournisseur externe lié";
      var role = u.role || "utilisateur";
      var permissions = u.permissions || {};
      var resume = [u.pseudo, u.id, u.bio, fournisseurs, identites, emails, u.admin ? "admin" : ""].join(" ").toLowerCase();
      var dernier = u.derniereActivite ? new Date(u.derniereActivite).toLocaleString("fr-FR") : "Aucune activité enregistrée";
      var etat = u.admin ? "Administrateur protégé" : (u.banni ? "Banni" :
        (u.suspenduJusqua > Date.now() ? "Suspendu jusqu’au " + new Date(u.suspenduJusqua).toLocaleString("fr-FR") : "Actif"));
      return '<li data-q="' + K.esc(resume) + '" data-provider="' + K.esc((u.fournisseurs || []).join(",")) + '" data-role="' + K.esc(role) + '" data-verified="' + (comptes.some(function (c) { return c.verifie; }) ? "true" : "false") + '">' + K.avatar(u.avatar, "av") +
        '<div class="txt"><strong>' + K.esc(u.pseudo || "Joueur") + (u.admin ? " · Administrateur" : "") + '</strong>' +
        '<span>' + K.esc(u.bio || "Aucune bio") + '</span>' +
        '<small>' + K.esc(fournisseurs) + ' · ' + K.esc(date) + '</small>' +
        '<small>' + (u.publications || 0) + ' publication(s) · ' + (u.abonnes || 0) + ' abonné(s) · ' + (u.abonnements || 0) + ' abonnement(s)</small>' +
        '<small>' + K.esc(identites) + '</small>' +
        '<small>' + K.esc(emails) + '</small><small>Dernière activité : ' + K.esc(dernier) + ' · ' + K.esc(etat) + '</small>' +
        '<small>ID : ' + K.esc(u.id) + '</small>' +
        (u.historique && u.historique.length ? '<details><summary>Historique des connexions (' + u.historique.length + ')</summary><small>' +
          u.historique.map(function (x) { return K.esc(new Date(x.date).toLocaleString("fr-FR") + " · " + x.fournisseur); }).join("<br>") +
          '</small></details>' : '') + '</div>' +
        (u.admin ? '' : '<div class="adm-user-controls" data-user="' + K.esc(u.id) + '">' +
          '<label class="adm-page-field">Rôle<select data-role-select><option value="utilisateur"' + (role === "utilisateur" ? " selected" : "") + '>Utilisateur</option><option value="moderateur"' + (role === "moderateur" ? " selected" : "") + '>Modérateur</option><option value="personnalise"' + (role === "personnalise" ? " selected" : "") + '>Personnalisé</option></select></label>' +
          '<label><input type="checkbox" data-perm="gererPublications"' + (permissions.gererPublications ? " checked" : "") + '> Gérer les publications</label>' +
          '<label><input type="checkbox" data-perm="gererCommentaires"' + (permissions.gererCommentaires ? " checked" : "") + '> Gérer les commentaires</label>' +
          '<div class="adm-user-actions"><button class="mini" type="button" data-user-action="save">Enregistrer rôle et permissions</button>' +
          '<button class="mini danger" type="button" data-user-action="ban">' + (u.banni ? "Débannir" : "Bannir") + '</button>' +
          '<button class="mini" type="button" data-user-action="suspend">' + (u.suspenduJusqua > Date.now() ? "Lever la suspension" : "Suspendre 7 jours") + '</button></div></div>') + '</li>';
    }).join(""));
  }

  function chargerUtilisateurs(curseur, ajouter) {
    if (chargement) return;
    chargement = true;
    var bouton = document.getElementById("adm-users-more");
    var note = document.getElementById("adm-users-message");
    bouton.disabled = true;
    K.appel("GET", "/api/admin/utilisateurs" + (curseur ? "?cursor=" + encodeURIComponent(curseur) : "")).then(function (d) {
      utilisateursCharges = ajouter ? utilisateursCharges.concat(d.utilisateurs || []) : (d.utilisateurs || []);
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
    function chargerTousPourRecherche() {
      if (!suivant || chargementRecherche) return;
      chargementRecherche = true;
      var bouton = document.getElementById("adm-users-more");
      bouton.disabled = true;
      bouton.textContent = "Chargement des résultats…";
      function page(curseur) {
        return K.appel("GET", "/api/admin/utilisateurs?cursor=" + encodeURIComponent(curseur)).then(function (d) {
          utilisateursCharges = utilisateursCharges.concat(d.utilisateurs || []);
          rendreUtilisateurs(d.utilisateurs || [], true);
          suivant = d.curseur || null;
          return suivant ? page(suivant) : utilisateursCharges;
        });
      }
      page(suivant).then(function () {
        filtrer();
      }, function (erreur) {
        afficherMessage(document.getElementById("adm-users-message"), "Recherche incomplète : " + erreur.message, false);
      }).then(function () {
        chargementRecherche = false;
        bouton.disabled = false;
        bouton.textContent = "Charger la suite";
        bouton.hidden = !suivant;
      });
    }
    function filtrer() {
      var q = document.getElementById("adm-users-search").value.trim().toLowerCase();
      var fournisseur = document.getElementById("adm-users-provider").value;
      var role = document.getElementById("adm-users-role").value;
      var verifie = document.getElementById("adm-users-verified").checked;
      document.querySelectorAll("#adm-users-list li[data-q]").forEach(function (item) {
        item.hidden = (!!q && item.getAttribute("data-q").indexOf(q) < 0) ||
          (!!fournisseur && item.getAttribute("data-provider").split(",").indexOf(fournisseur) < 0) ||
          (!!role && item.getAttribute("data-role") !== role) ||
          (verifie && item.getAttribute("data-verified") !== "true");
      });
      if (q || fournisseur || role || verifie) chargerTousPourRecherche();
    }
    ["adm-users-search", "adm-users-provider", "adm-users-role", "adm-users-verified"].forEach(function (id) {
      document.getElementById(id).addEventListener("input", filtrer);
      document.getElementById(id).addEventListener("change", filtrer);
    });
    document.getElementById("adm-users-more").addEventListener("click", function () {
      if (suivant) chargerUtilisateurs(suivant, true);
    });
    document.getElementById("adm-users-export").addEventListener("click", function () {
      if (chargementExport) return;
      chargementExport = true;
      var bouton = this;
      var note = document.getElementById("adm-users-message");
      bouton.disabled = true;
      var tous = [];
      function page(curseur) {
        return K.appel("GET", "/api/admin/utilisateurs" + (curseur ? "?cursor=" + encodeURIComponent(curseur) : "")).then(function (d) {
          tous = tous.concat(d.utilisateurs || []);
          return d.curseur ? page(d.curseur) : tous;
        });
      }
      page(null).then(function (liste) {
        var lignes = [["Pseudo", "Compte(s) lié(s)", "E-mail", "Fournisseurs", "ID profil", "Rôle", "Vérifié", "Dernière activité", "Publications", "Abonnés"]];
        liste.forEach(function (u) {
          lignes.push([u.pseudo, (u.comptes || []).map(function (c) { return c.fournisseur + (c.nom ? " : " + c.nom : "") + (c.identifiant ? " (" + c.identifiant + ")" : ""); }).join(" | "),
            (u.comptes || []).map(function (c) { return c.email; }).filter(Boolean).join(" | "),
            (u.fournisseurs || []).join(" | "), u.id, u.role || "utilisateur",
            (u.comptes || []).some(function (c) { return c.verifie; }) ? "oui" : "non",
            u.derniereActivite ? new Date(u.derniereActivite).toISOString() : "", u.publications || 0, u.abonnes || 0]);
        });
        var csv = "\uFEFF" + lignes.map(function (l) {
          return l.map(function (v) {
            var valeur = String(v == null ? "" : v);
            if (/^[\s]*[=+\-@]/.test(valeur)) valeur = "'" + valeur;
            return '"' + valeur.replace(/"/g, '""') + '"';
          }).join(";");
        }).join("\r\n");
        var url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
        var lien = document.createElement("a");
        lien.href = url; lien.download = "utilisateurs.csv"; lien.click();
        window.setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
        afficherMessage(note, "Export CSV créé pour " + liste.length + " utilisateur(s).", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’exporter les utilisateurs : " + erreur.message, false);
      }).then(function () { chargementExport = false; bouton.disabled = false; });
    });
    document.getElementById("adm-users-list").addEventListener("click", function (e) {
      var bouton = e.target.closest("[data-user-action]");
      if (!bouton) return;
      var bloc = bouton.closest("[data-user]");
      var uid = bloc.getAttribute("data-user");
      var action = bouton.getAttribute("data-user-action");
      var demande;
      if (action === "save") {
        var permissions = {};
        bloc.querySelectorAll("[data-perm]").forEach(function (input) { permissions[input.getAttribute("data-perm")] = input.checked; });
        demande = { role: bloc.querySelector("[data-role-select]").value, permissions: permissions };
      } else if (action === "ban") {
        var utilisateur = utilisateursCharges.find(function (u) { return u.id === uid; });
        var banni = !(utilisateur && utilisateur.banni);
        if (banni && !confirm("Bannir cet utilisateur ? Il ne pourra plus effectuer d’actions avec son compte.")) return;
        demande = { banni: banni, suspenduJusqua: 0 };
      } else {
        var compte = utilisateursCharges.find(function (u) { return u.id === uid; });
        demande = compte && compte.suspenduJusqua > Date.now() ? { suspenduJusqua: 0 } :
          { suspenduJusqua: Date.now() + 7 * 24 * 60 * 60 * 1000 };
      }
      bouton.disabled = true;
      K.appel("PATCH", "/api/admin/utilisateurs/" + encodeURIComponent(uid), demande).then(function () {
        afficherMessage(document.getElementById("adm-users-message"), "Informations du compte mises à jour.", true);
        utilisateursCharges = [];
        return chargerUtilisateurs(null, false);
      }, function (erreur) {
        afficherMessage(document.getElementById("adm-users-message"), "Action impossible : " + erreur.message, false);
      }).then(function () { bouton.disabled = false; });
    });
    document.getElementById("adm-users-list").addEventListener("change", function (e) {
      var select = e.target.closest("[data-role-select]");
      if (!select) return;
      var permissions = select.closest("[data-user]").querySelectorAll("[data-perm]");
      if (select.value === "moderateur") {
        permissions.forEach(function (input) { input.checked = true; });
      } else if (select.value === "utilisateur") {
        permissions.forEach(function (input) { input.checked = false; });
      }
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
      ["accueil", "Accueil", "index.html"],
      ["programme", "Programme", "programme.html"],
      ["series", "Séries", "series.html"],
      ["communaute", "Communauté", "communaute.html"],
      ["fil", "Fil de publications", "fil.html"],
      ["affiliation", "Affiliation", "Affiliation.html"],
      ["contact", "Contact", "contact.html"],
      ["mentions", "Mentions légales", "mentions.html"],
      ["profil", "Profil public", "profil.html"],
      ["parametres", "Paramètres du compte", "parametres.html"]
    ];
    var form = document.getElementById("adm-maintenance-form");
    var zone = document.getElementById("adm-maintenance-pages");
    var note = document.getElementById("adm-maintenance-message");
    var actives = reglages.maintenance || SITE.maintenance || {};
    var maintenance = (reglages.siteOptions && reglages.siteOptions.maintenance) || {};
    var pagesActives = (reglages.siteOptions && reglages.siteOptions.pagesActives) || {};
    var redirections = (reglages.siteOptions && reglages.siteOptions.redirections) || {};
    form.elements.maintenanceMessage.value = maintenance.message || "";
    form.elements.maintenanceImage.value = /^https:\/\//i.test(maintenance.image || "") ? maintenance.image : "";
    if (maintenance.ouverture > Date.now()) {
      var d = new Date(maintenance.ouverture);
      form.elements.maintenanceOuverture.value = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    }
    zone.innerHTML = pages.map(function (page) {
      var active = pagesActives[page[0]] !== false;
      var target = redirections[page[0]] || "";
      return '<div class="adm-page-status-row"><strong>' + page[1] + '</strong>' +
        '<label><input type="checkbox" name="page-' + page[0] + '"' + (actives[page[0]] && active ? " checked" : "") + '> Maintenance</label>' +
        '<label><input type="checkbox" name="active-' + page[0] + '"' + (active ? " checked" : "") + '> Page active</label>' +
        '<label class="adm-page-field">Redirection si désactivée<select name="redirect-' + page[0] + '"><option value="">Aucune</option>' +
        pages.filter(function (candidate) { return candidate[0] !== page[0] && candidate[0] !== "profil"; }).map(function (candidate) {
          return '<option value="' + candidate[2] + '"' + (target === candidate[2] ? " selected" : "") + '>' + candidate[1] + '</option>';
        }).join("") + '</select></label></div>';
    }).join("");
    zone.addEventListener("change", function (e) {
      var input = e.target.closest('input[type="checkbox"]');
      if (!input) return;
      var row = input.closest(".adm-page-status-row");
      if (input.name.indexOf("page-") === 0 && input.checked) {
        row.querySelector('[name="active-' + input.name.slice(5) + '"]').checked = true;
      } else if (input.name.indexOf("active-") === 0 && !input.checked) {
        row.querySelector('[name="page-' + input.name.slice(7) + '"]').checked = false;
      }
    });
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var maintenancePages = {};
      var pagesActivesNouvelles = {};
      var redirectionsNouvelles = {};
      pages.forEach(function (page) {
        maintenancePages[page[0]] = form.elements["page-" + page[0]].checked;
        pagesActivesNouvelles[page[0]] = form.elements["active-" + page[0]].checked;
        redirectionsNouvelles[page[0]] = form.elements["redirect-" + page[0]].value;
      });
      var bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      K.appel("PUT", "/api/reglages", {
        maintenance: maintenancePages,
        siteOptions: {
          maintenance: {
            message: form.elements.maintenanceMessage.value,
            image: form.elements.maintenanceImage.value,
            ouverture: form.elements.maintenanceOuverture.value ? new Date(form.elements.maintenanceOuverture.value).toISOString() : ""
          },
          pagesActives: pagesActivesNouvelles,
          redirections: redirectionsNouvelles
        }
      }).then(function () {
        afficherMessage(note, "Réglages de maintenance enregistrés. Les visiteurs verront le changement à leur prochaine visite.", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’enregistrer la maintenance : " + erreur.message, false);
      }).then(function () { bouton.disabled = false; });
    });
  }

  function initialiserSite(reglages) {
    var options = reglages.siteOptions || {};
    var banniere = options.banniere || {};
    var popup = options.popup || {};
    var bienvenue = options.bienvenue || {};
    var seo = options.seo || {};
    var form = document.getElementById("adm-site-form");
    var note = document.getElementById("adm-site-message");
    form.elements.banniereActive.checked = !!banniere.actif;
    form.elements.banniereTexte.value = banniere.texte || "";
    form.elements.banniereLien.value = banniere.lien || "";
    form.elements.popupActive.checked = !!popup.actif;
    form.elements.popupTitre.value = popup.titre || "";
    form.elements.popupTexte.value = popup.texte || "";
    form.elements.bienvenueActive.checked = !!bienvenue.actif;
    form.elements.bienvenueMessage.value = bienvenue.message || "";
    form.elements.seoTitre.value = seo.titre || "";
    form.elements.seoDescription.value = seo.description || "";
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var bouton = form.querySelector('button[type="submit"]');
      bouton.disabled = true;
      K.appel("PUT", "/api/reglages", {
        siteOptions: {
          banniere: {
            actif: form.elements.banniereActive.checked,
            texte: form.elements.banniereTexte.value,
            lien: form.elements.banniereLien.value
          },
          popup: {
            actif: form.elements.popupActive.checked,
            titre: form.elements.popupTitre.value,
            texte: form.elements.popupTexte.value
          },
          bienvenue: {
            actif: form.elements.bienvenueActive.checked,
            message: form.elements.bienvenueMessage.value
          },
          seo: { titre: form.elements.seoTitre.value, description: form.elements.seoDescription.value }
        }
      }).then(function () {
        afficherMessage(note, "Réglages enregistrés. Les visiteurs verront les changements lors de leur prochaine visite.", true);
      }, function (erreur) {
        afficherMessage(note, "Impossible d’enregistrer les réglages : " + erreur.message, false);
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
        else if (section === "site") initialiserSite(reglages);
      });
    }
  }).catch(function (e) {
    refuser("Impossible de vérifier les droits ou de charger les réglages : " + e.message + ". Reconnecte-toi puis réessaie.", false);
  });
})();
