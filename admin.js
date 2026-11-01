/* Espace administrateur : tableau de bord alimenté par les données réelles du serveur */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var corps = document.getElementById("adm-corps");
  var etat = document.getElementById("adm-etat");
  var recherche = document.getElementById("adm-recherche");
  var dateFR = function (t) { try { return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } };
  var heure = function (t) { try { return new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } };
  var esc = K.esc;
  var ICO = {
    pub: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h10"/></svg>',
    ann: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v12H7l-3 3z"/></svg>',
    quest: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5M12 17h.01"/></svg>',
    rep: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12l4 4 10-10"/></svg>',
    maint: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.5-.5-.5-2.5z"/></svg>',
    send: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4z"/></svg>',
    fil: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16M4 10h16M4 15h10"/></svg>',
    set: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2"/></svg>',
    theme: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor"/></svg>',
    user: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg>',
    like: '<svg class="i line" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-4.5-9.5-9A5 5 0 0 1 12 6a5 5 0 0 1 9.5 6c-2.5 4.5-9.5 9-9.5 9z"/></svg>'
  };

  function ligne(type, titre, detail, date, cherche) {
    return '<li data-q="' + esc((titre + " " + detail).toLowerCase()) + '"><span class="adm-ligne-type">' + type + '</span>' +
      '<div class="txt"><strong>' + esc(titre) + '</strong><span>' + esc(detail) + '</span></div><time>' + esc(heure(date)) + '</time></li>';
  }

  function rendre(moi, fil, contenu) {
    var annonces = contenu.annonces || [], quests = contenu.questionnaires || [];
    var reponses = 0;
    quests.forEach(function (q) { reponses += (q.resultats && q.resultats.total) || 0; });
    var nbPub = fil.length;
    var session = K.session() || {};

    // Barre latérale : identité
    document.getElementById("adm-qui").innerHTML = (session.avatar
      ? '<img src="' + esc(session.avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="ini">' + esc((moi.nom || "A").charAt(0).toUpperCase()) + '</span>') +
      '<div style="min-width:0"><strong>' + esc(moi.nom) + '</strong><small>Administrateur</small></div>';

    var stats = [
      [ICO.pub, nbPub >= 100 ? "100+" : nbPub, "Publications du fil"],
      [ICO.ann, annonces.length, "Annonces publiées"],
      [ICO.quest, quests.length, "Questionnaires"],
      [ICO.rep, reponses, "Réponses reçues"]
    ];

    // Dernières publications et activité (triées par date)
    var activite = [];
    annonces.forEach(function (a) { activite.push({ t: a.date, html: ligne(ICO.ann, a.titre, "Annonce" + (a.texte ? " · " + a.texte.slice(0, 80) : ""), a.date) }); });
    quests.forEach(function (q) { activite.push({ t: q.date, html: ligne(ICO.quest, q.titre, "Questionnaire · " + (q.ouvert ? "ouvert" : "clos") + " · " + ((q.resultats && q.resultats.total) || 0) + " réponse(s)", q.date) }); });
    fil.forEach(function (p) { activite.push({ t: p.date, html: ligne(ICO.pub, (p.auteur && p.auteur.pseudo) || "Joueur", p.texte ? p.texte.slice(0, 120) : "Publication avec image", p.date) }); });
    activite.sort(function (x, y) { return y.t - x.t; });
    activite = activite.slice(0, 8);

    var derniers = fil.slice(0, 4).map(function (p) {
      var a = p.auteur || { pseudo: "Joueur", avatar: "" };
      return '<li data-q="' + esc((a.pseudo + " " + (p.texte || "")).toLowerCase()) + '">' + K.avatar(a.avatar, "av") +
        '<div class="txt"><strong>' + esc(a.pseudo) + '</strong><span>' + esc(p.texte || "Publication avec image") + '</span></div>' +
        '<time>' + esc(heure(p.date)) + '<br>' + ICO.like + ' ' + p.aime + ' · ' + p.commentaires + ' com.</time></li>';
    }).join("");

    var max = Math.max(1, nbPub, annonces.length, quests.length, reponses);
    var barre = function (nom, n) {
      return '<div><span>' + nom + '</span><span class="piste"><span style="width:' + Math.round(n * 100 / max) + '%"></span></span><b>' + n + '</b></div>';
    };

    corps.innerHTML =
      '<section class="adm-banner" id="adm-tableau"><div><h1>Bienvenue, <span>' + esc(moi.nom) + '</span> !</h1>' +
        '<p>Gère l\'accueil, les annonces, le fil et les réglages du site depuis un seul endroit.</p></div>' +
        '<div class="adm-date">' + esc(dateFR(Date.now())) + '</div></section>' +

      '<section class="adm-stats" aria-label="Chiffres clés">' + stats.map(function (s) {
        return '<div class="adm-stat"><span class="adm-ico">' + s[0] + '</span><div><b>' + s[1] + '</b><small>' + s[2] + '</small></div></div>';
      }).join("") + '</section>' +

      '<section class="adm-section">' +
        '<div class="adm-section-heading"><h2>Administration du site</h2><p>Chaque réglage se trouve dans sa page dédiée.</p></div>' +
        ‘<div class="adm-grid adm-tool-grid">’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.user + ‘</span><h3>Utilisateurs</h3></div>’ +
            ‘<p class="adm-tool-desc">Consulter les comptes et gérer les rôles, permissions et suspensions.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-utilisateurs.html">Gérer les utilisateurs</a>’ +
              ‘<a class="adm-quick" href="admin-utilisateurs.html#adm-users-search">Rechercher</a>’ +
              ‘<button class="adm-quick" type="button" id="dash-export-csv" title="Exporter tous les utilisateurs en CSV">Export CSV</button>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.fil + ‘</span><h3>Statistiques</h3></div>’ +
            ‘<p class="adm-tool-desc">Consulter les visites, les pages populaires et les catégories d’audience anonymes.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-analytics.html">Voir les statistiques</a>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.set + ‘</span><h3>Réglages du site</h3></div>’ +
            ‘<p class="adm-tool-desc">Configurer la bannière, la popup, le message d’accueil et le SEO.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-site.html">Ouvrir les réglages</a>’ +
              ‘<button class="adm-quick" type="button" id="dash-toggle-banniere">Bannière&nbsp;–</button>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.maint + ‘</span><h3>Pages &amp; maintenance</h3></div>’ +
            ‘<p class="adm-tool-desc">Gérer la disponibilité, la maintenance et les redirections des pages.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-maintenance.html">Gérer les pages</a>’ +
              ‘<button class="adm-quick" type="button" id="dash-toggle-maintenance">Maintenance accueil&nbsp;–</button>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.theme + ‘</span><h3>Thème par défaut</h3></div>’ +
            ‘<p class="adm-tool-desc">Choisir le thème proposé par défaut aux visiteurs.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-theme.html">Régler le thème</a>’ +
              ‘<button class="adm-quick" type="button" id="dash-toggle-theme">Basculer thème</button>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.theme + ‘</span><h3>Musique par défaut</h3></div>’ +
            ‘<p class="adm-tool-desc">Choisir la musique proposée par défaut aux visiteurs.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="admin-musique.html">Régler la musique</a>’ +
            ‘</div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.user + ‘</span><h3>Mon profil</h3></div>’ +
            ‘<p class="adm-tool-desc">Consulter le profil public associé à ton compte administrateur.</p>’ +
            ‘<div class="adm-tool-footer">’ +
              ‘<a class="adm-action" href="profil.html?id=’ + encodeURIComponent(moi.id) + ‘">Voir mon profil</a>’ +
            ‘</div></article>’ +

        ‘</div>’ +
      '</section>' +

      '<section class="adm-section">' +
        '<div class="adm-section-heading"><h2>Publication et communauté</h2><p>Outils de publication et d’animation du site.</p></div>' +
        '<div class="adm-grid adm-tool-grid">' +
          '<article class="adm-card"><h2>' + ICO.send + 'Publier une annonce</h2>' +
            '<p>Une annonce est visible par tous les visiteurs sur l’accueil, avec ses commentaires.</p>' +
            '<form id="adm-annonce" novalidate>' +
              '<label class="adm-champ">Titre<input name="titre" maxlength="120" required></label>' +
              '<label class="adm-champ">Texte<textarea name="texte" rows="3" maxlength="2000"></textarea></label>' +
              '<label class="adm-champ">Lien (facultatif)<input name="lien" type="url" placeholder="https://..."></label>' +
              '<p class="adm-msg" id="adm-annonce-msg" hidden></p>' +
              '<button class="btn-solid" type="submit" style="margin-top:0">Publier l’annonce</button></form></article>' +
          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.quest + ‘</span><h3>Questionnaires</h3></div>’ +
            ‘<p class="adm-tool-desc">Créer et gérer les questionnaires proposés sur la page d’accueil.</p>’ +
            ‘<div class="adm-tool-footer"><a class="adm-action" href="index.html#section-annonces">Gérer les questionnaires</a></div></article>’ +

          ‘<article class="adm-card adm-tool-card">’ +
            ‘<div class="adm-tool-head"><span class="adm-tool-ico">’ + ICO.fil + ‘</span><h3>Fil de publications</h3></div>’ +
            ‘<p class="adm-tool-desc">Consulter les publications et les échanges de la communauté.</p>’ +
            ‘<div class="adm-tool-footer"><a class="adm-action" href="fil.html">Ouvrir le fil</a></div></article>’ +
        '</div>' +
      '</section>' +

      '<section class="adm-section">' +
        '<div class="adm-section-heading"><h2>Vue d’ensemble</h2><p>Activité et contenus publiés récemment.</p></div>' +
        '<div class="adm-grid">' +
          '<article class="adm-card large"><h2>' + ICO.fil + 'Dernières publications <a href="fil.html">Voir tout</a></h2>' +
            (derniers ? '<ul class="adm-liste" data-filtrable>' + derniers + '</ul>' : '<p>Aucune publication pour l\'instant.</p>') + '</article>' +
          '<article class="adm-card"><h2>Activité récente</h2>' +
            (activite.length ? '<ul class="adm-liste" data-filtrable>' + activite.map(function (x) { return x.html; }).join("") + '</ul>' : '<p>Rien d\'enregistré pour l\'instant.</p>') + '</article>' +
          '<article class="adm-card"><h2>Contenu du site</h2>' +
            '<div class="adm-barres">' + barre("Publications", nbPub) + barre("Annonces", annonces.length) + barre("Questionnaires", quests.length) + barre("Réponses", reponses) + '</div>' +
            '<p>Les visites du site ne sont pas comptées : seuls les contenus publiés sont affichés ici.</p></article>' +
        '</div>' +
      '</section>';

  }

  function message(el, texte, ok) {
    el.hidden = !texte;
    el.textContent = texte || "";
    el.className = "adm-msg " + (ok ? "ok" : "err");
  }

  function brancher() {
    var f = document.getElementById("adm-annonce"), msgEl = document.getElementById("adm-annonce-msg");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!f.titre.value.trim()) { message(msgEl, "Le titre est obligatoire.", false); return; }
      var btn = f.querySelector("button"); btn.disabled = true;
      K.appel("POST", "/api/annonces", { titre: f.titre.value, texte: f.texte.value, lien: f.lien.value }).then(function () {
        f.reset(); message(msgEl, "Annonce publiée. Elle apparaît sur l'accueil.", true); btn.disabled = false;
      }, function (er) { message(msgEl, er.message, false); btn.disabled = false; });
    });

    // ---- Boutons rapides du dashboard ----

    // Toggle bannière
    var btnBanniere = document.getElementById("dash-toggle-banniere");
    if (btnBanniere) {
      K.appel("GET", "/api/reglages").then(function (reg) {
        var opts = (reg.siteOptions && reg.siteOptions.banniere) || {};
        var actif = !!opts.actif;
        btnBanniere.textContent = "Bannière – " + (actif ? "ON" : "OFF");
        btnBanniere.style.color = actif ? "var(--red)" : "";
        btnBanniere.addEventListener("click", function () {
          btnBanniere.disabled = true;
          K.appel("PUT", "/api/reglages", { siteOptions: { banniere: Object.assign({}, opts, { actif: !actif }) } }).then(function () {
            actif = !actif;
            btnBanniere.textContent = "Bannière – " + (actif ? "ON" : "OFF");
            btnBanniere.style.color = actif ? "var(--red)" : "";
            btnBanniere.disabled = false;
          }, function (e) { alert(e.message); btnBanniere.disabled = false; });
        });
      }, function () { btnBanniere.textContent = "Bannière"; });
    }

    // Toggle maintenance accueil
    var btnMaint = document.getElementById("dash-toggle-maintenance");
    if (btnMaint) {
      K.appel("GET", "/api/reglages").then(function (reg) {
        var maintenancePages = reg.maintenance || {};
        var actif = !!maintenancePages.accueil;
        btnMaint.textContent = "Maintenance accueil – " + (actif ? "ON" : "OFF");
        btnMaint.style.color = actif ? "var(--red)" : "";
        btnMaint.addEventListener("click", function () {
          btnMaint.disabled = true;
          var mise = Object.assign({}, maintenancePages, { accueil: !actif });
          K.appel("PUT", "/api/reglages", { maintenance: mise }).then(function () {
            actif = !actif;
            maintenancePages = mise;
            btnMaint.textContent = "Maintenance accueil – " + (actif ? "ON" : "OFF");
            btnMaint.style.color = actif ? "var(--red)" : "";
            btnMaint.disabled = false;
          }, function (e) { alert(e.message); btnMaint.disabled = false; });
        });
      }, function () { btnMaint.textContent = "Maintenance accueil"; });
    }

    // Toggle thème par défaut
    var btnTheme = document.getElementById("dash-toggle-theme");
    if (btnTheme) {
      K.appel("GET", "/api/reglages").then(function (reg) {
        var defauts = (reg.reglagesParDefaut) || {};
        var theme = defauts.theme || "normal";
        btnTheme.textContent = "Thème : " + (theme === "sombre" ? "Sombre" : "Clair");
        btnTheme.addEventListener("click", function () {
          btnTheme.disabled = true;
          var nouveau = theme === "sombre" ? "normal" : "sombre";
          K.appel("PUT", "/api/reglages", { reglagesParDefaut: Object.assign({}, defauts, { theme: nouveau }) }).then(function () {
            theme = nouveau;
            btnTheme.textContent = "Thème : " + (theme === "sombre" ? "Sombre" : "Clair");
            btnTheme.disabled = false;
          }, function (e) { alert(e.message); btnTheme.disabled = false; });
        });
      }, function () { btnTheme.textContent = "Basculer thème"; });
    }

    // Export CSV depuis le dashboard
    var btnCsv = document.getElementById("dash-export-csv");
    if (btnCsv) {
      btnCsv.addEventListener("click", function () {
        btnCsv.disabled = true;
        var tous = [], curseur = null;
        function page(c) {
          return K.appel("GET", "/api/admin/utilisateurs" + (c ? "?cursor=" + encodeURIComponent(c) : "")).then(function (d) {
            tous = tous.concat(d.utilisateurs || []);
            return d.nextCursor ? page(d.nextCursor) : tous;
          });
        }
        page(null).then(function (liste) {
          var csv = "Pseudo,ID,Fournisseur,Email,Rôle,Vérifié,Dernière activité\n" + liste.map(function (u) {
            var comptes = u.comptes || [];
            var email = comptes.filter(function (c) { return c.email; }).map(function (c) { return c.email; }).join("|");
            return [u.pseudo, u.id, (u.fournisseurs || []).join("|"), email, u.role || "utilisateur",
              (u.verifie || comptes.some(function (c) { return c.verifie; })) ? "oui" : "non",
              u.derniereActivite ? new Date(u.derniereActivite).toLocaleString("fr-FR") : ""].map(function (v) {
              return '"' + String(v).replace(/"/g, '""') + '"';
            }).join(",");
          }).join("\n");
          var blob = new Blob([csv], { type: "text/csv" }); var url = URL.createObjectURL(blob);
          var a = document.createElement("a"); a.href = url; a.download = "utilisateurs.csv"; a.click();
          setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
          btnCsv.disabled = false;
        }, function (e) { alert(e.message); btnCsv.disabled = false; });
      });
    }

    recherche.addEventListener("input", function () {
      var q = recherche.value.trim().toLowerCase();
      document.querySelectorAll("[data-filtrable] li, .adm-users li[data-q]").forEach(function (li) {
        li.hidden = !!q && (li.getAttribute("data-q") || "").indexOf(q) < 0;
      });
    });

    document.getElementById("adm-deco").addEventListener("click", function () {
      if (window.LNI_AUTH) window.LNI_AUTH.deconnecter();
      location.href = "index.html";
    });
  }

  function refuser(texte, bouton) {
    corps.innerHTML = '<section class="adm-card adm-vide" style="margin:auto;max-width:520px"><h2>Espace administrateur</h2><p>' + esc(texte) + '</p>' + (bouton || "") + '</section>';
  }

  if (!K.connecte()) {
    refuser("Connecte-toi avec un compte administrateur pour accéder à cet espace.", '<button class="btn-solid" type="button" id="adm-login">Se connecter</button>');
    var b = document.getElementById("adm-login"); if (b) b.addEventListener("click", K.ouvrirConnexion);
    document.getElementById("adm-deco").hidden = true;
    return;
  }

  Promise.all([K.appel("GET", "/api/moi"), K.appel("GET", "/api/fil"), K.appel("GET", "/api/contenu")])
    .then(function (r) {
      if (!r[0].admin) { refuser("Cet espace est réservé aux administrateurs.", '<a class="btn-solid" href="fil.html">Retour au fil</a>'); document.getElementById("adm-deco").hidden = false; return; }
      rendre(r[0], r[1], r[2]);
      brancher();
    }, function (e) {
      refuser("Impossible de charger le tableau de bord : " + e.message + ". Reconnecte-toi puis réessaie.", '<button class="btn-solid" type="button" onclick="location.reload()">Réessayer</button>');
    });
})();
