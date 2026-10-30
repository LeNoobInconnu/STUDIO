/* Moteur du site : construit les pages à partir de site.js (ne pas modifier) */
(function () {
  "use strict";

  var CLE = "lni_reglages";
  var CLE_ANNONCE = "lni_annonce_fermee";

  function esc(s) {
    return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function lien(k) { return (SITE.liens && SITE.liens[k]) || ""; }

  /* ------------------------------------------------------------------
     Réglages du visiteur (thème, musique), partagés entre toutes les pages
     ------------------------------------------------------------------ */
  var def = SITE.reglagesParDefaut || {};
  var R = {
    theme: def.theme === "sombre" ? "sombre" : "normal",
    musique: !!def.musique,
    volume: SITE.musique && SITE.musique.volume != null ? SITE.musique.volume : 0.3,
    pos: 0,
    ts: 0
  };
  try {
    var enreg = JSON.parse(localStorage.getItem(CLE) || "null");
    if (enreg) { for (var k in enreg) { if (Object.prototype.hasOwnProperty.call(R, k)) R[k] = enreg[k]; } }
  } catch (e) {}

  function sauver() { try { localStorage.setItem(CLE, JSON.stringify(R)); } catch (e) {} }
  function appliquerTheme() {
    document.documentElement.setAttribute("data-theme", R.theme === "sombre" ? "dark" : "light");
  }
  appliquerTheme(); // tout de suite, pour éviter un flash blanc

  /* ------------------------------------------------------------------
     Musique
     ------------------------------------------------------------------ */
  var audio = null;
  var etatAudio = "aucun"; // aucun | chargement | ok | absent
  var dernierSave = 0;

  function initMusique() {
    var m = SITE.musique || {};
    if (!m.fichier) return;
    etatAudio = "chargement";
    audio = new Audio();
    audio.loop = true;
    audio.preload = "auto";
    audio.volume = Math.max(0, Math.min(1, R.volume));
    audio.addEventListener("error", function () { etatAudio = "absent"; majReglages(); });
    audio.addEventListener("loadedmetadata", function () {
      etatAudio = "ok";
      var d = audio.duration || 0;
      if (R.musique && R.ts && d > 0) {
        var ecoule = Math.min((Date.now() - R.ts) / 1000, 3);
        try { audio.currentTime = (R.pos + ecoule) % d; } catch (e) {}
      } else if (d > 0 && R.pos > 0) {
        try { audio.currentTime = R.pos % d; } catch (e) {}
      }
      majReglages();
      if (R.musique) jouer();
    });
    audio.addEventListener("timeupdate", function () {
      var now = Date.now();
      if (!audio.paused && now - dernierSave > 1000) {
        dernierSave = now; R.pos = audio.currentTime; R.ts = now; sauver();
      }
    });
    audio.src = m.fichier;
    audio.load();
    window.addEventListener("pagehide", function () {
      if (audio && !audio.paused) { R.pos = audio.currentTime; R.ts = Date.now(); sauver(); }
    });
  }

  function jouer() {
    if (!audio) return;
    var p = audio.play();
    if (p && p.catch) {
      p.catch(function () { attendreClic(); });
    }
  }
  // Les navigateurs bloquent le son avant un clic : on relance au premier geste.
  function attendreClic() {
    var evts = ["pointerdown", "keydown", "touchstart"];
    function go() {
      evts.forEach(function (e) { document.removeEventListener(e, go, true); });
      if (R.musique && audio) { audio.play().catch(function () {}); }
    }
    evts.forEach(function (e) { document.addEventListener(e, go, true); });
  }
  function basculerMusique(on) {
    R.musique = !!on;
    if (!audio) { sauver(); majReglages(); return; }
    if (on) { jouer(); } else { audio.pause(); R.pos = audio.currentTime; R.ts = 0; }
    sauver();
    majReglages();
  }

  /* ------------------------------------------------------------------
     Pages et navigation
     ------------------------------------------------------------------ */
  function pages() {
    var p = [
      { id: "accueil", href: "index.html", label: "Accueil", icon: "home" },
      { id: "programme", href: "programme.html", label: "Programme", icon: "calendar" },
      { id: "series", href: "series.html", label: "Séries", icon: "series" },
      { id: "communaute", href: "communaute.html", label: "Communauté", icon: "people" },
      { id: "affiliation", href: "Affiliation.html", label: "Affiliation", icon: "affil" }
    ];
    if (lien("boutique")) p.push({ id: "boutique", href: lien("boutique"), label: "Boutique", icon: "shop", externe: true });
    var c = { id: "contact", href: "contact.html", label: "Contact", icon: "mail" };
    if (lien("contact")) { c.href = lien("contact"); c.externe = true; }
    p.push(c);
    return p;
  }
  function cible(p) { return p.externe ? ' target="_blank" rel="noopener"' : ""; }

  function logoHtml() {
    return '<a class="logo" href="index.html" aria-label="' + esc(SITE.nom) + ', accueil">' +
      '<img src="' + esc(SITE.logo) + '" alt="' + esc(SITE.nom) + '" onerror="this.parentNode.classList.add(\'no-img\')">' +
      '<span class="logo-text">Le Noob<br>Inconnu<small>CHAÎNE YOUTUBE</small></span></a>';
  }

  function annonceHtml() {
    var a = SITE.annonce || {};
    if (!a.actif || !a.texte) return "";
    var fermable = a.fermable !== false;
    try { if (fermable && localStorage.getItem(CLE_ANNONCE) === a.texte) return ""; } catch (e) {}
    var l = a.lien ? ' <a href="' + esc(a.lien) + '" target="_blank" rel="noopener">' + esc(a.texteLien || "En savoir plus") + ICON.arrow + '</a>' : "";
    var x = fermable ? '<button type="button" class="annonce-x" aria-label="Fermer l\'annonce">' + ICON.close + '</button>' : "";
    return '<div class="annonce" role="status"><div class="wrap"><p>' + esc(a.texte) + l + '</p>' + x + '</div></div>';
  }

  function reglagesHtml() {
    return '<div class="reg-wrap">' +
      '<button class="btn-icon" id="btn-reglages" type="button" aria-expanded="false" aria-controls="panel-reglages" aria-label="Réglages">' + ICON.settings + '</button>' +
      '<div class="reglages" id="panel-reglages" role="dialog" aria-label="Réglages" hidden>' +
        '<h2>Réglages</h2>' +
        '<div class="reg-bloc"><span class="reg-label">Thème</span>' +
          '<div class="seg" role="group" aria-label="Thème">' +
            '<button type="button" data-theme-btn="normal">' + ICON.sun + 'Normal</button>' +
            '<button type="button" data-theme-btn="sombre">' + ICON.moon + 'Sombre</button>' +
          '</div></div>' +
        '<div class="reg-bloc"><span class="reg-label">Musique</span>' +
          '<label class="switch"><input type="checkbox" id="reg-musique"><span class="piste"></span><span class="switch-text" id="reg-musique-etat">Désactivée</span></label>' +
          '<input type="range" id="reg-volume" min="0" max="100" step="1" aria-label="Volume de la musique">' +
          '<p class="reg-note" id="reg-note" hidden></p></div>' +
      '</div></div>';
  }

  /* Bouton "Se connecter" (le fonctionnement est dans auth.js) */
  function compteHtml() {
    if (!(SITE.connexion && SITE.connexion.actif)) return "";
    return '<div class="compte-wrap" id="compte-wrap"><button class="btn-login js-compte" type="button">Se connecter</button></div>';
  }

  function renderHeader(courant) {
    var liens = pages().map(function (p) {
      var pastille = SITE.maintenance && SITE.maintenance[p.id] ? '<span class="dot" title="En maintenance"></span>' : "";
      return '<li><a href="' + esc(p.href) + '"' + cible(p) + (p.id === courant ? ' aria-current="page"' : '') + '>' + ICON[p.icon] + esc(p.label) + pastille + '</a></li>';
    }).join("");
    var connexion = SITE.connexion && SITE.connexion.actif;
    var liensM = pages().map(function (p, i) {
      return '<li><a href="' + esc(p.href) + '"' + cible(p) + (p.id === courant ? ' aria-current="page"' : '') + '>' + esc(p.label) + '<span class="num-m">0' + (i + 1) + '</span></a></li>';
    }).join("");
    var menuMobile = '<div class="menu-mobile" id="menu-mobile" hidden>' +
      '<div class="mm-top">' + logoHtml() + '<button class="btn-icon" id="menu-fermer" type="button" aria-label="Fermer le menu">' + ICON.close + '</button></div>' +
      '<ul class="mm-links">' + liensM + '</ul>' +
      '<div class="mm-actions">' +
        (connexion ? '<div class="compte-wrap"><button class="btn-login js-compte" type="button">Se connecter</button></div>' : '') +
        '<a class="btn-outline" href="' + esc(lien("discord")) + '" target="_blank" rel="noopener">' + ICON.discord + 'Rejoindre le Discord</a>' +
      '</div></div>';
    var burger = '<button class="btn-icon burger" id="menu-ouvrir" type="button" aria-expanded="false" aria-controls="menu-mobile" aria-label="Ouvrir le menu">' + ICON.menu + '</button>';
    return annonceHtml() +
      '<header class="nav"><div class="wrap">' + logoHtml() +
      '<ul class="links">' + liens + '</ul>' +
      '<div class="nav-right"><a class="btn-outline" href="' + esc(lien("discord")) + '" target="_blank" rel="noopener">' + ICON.discord + 'Discord</a>' + compteHtml() + reglagesHtml() + burger + '</div>' +
      '</div>' + menuMobile + '</header>';
  }

  function renderFooter() {
    var nav = pages().map(function (p) {
      return '<li><a href="' + esc(p.href) + '"' + cible(p) + '>' + ICON[p.icon] + esc(p.label) + '</a></li>';
    }).join("");
    var nets = [
      ["youtube", "YouTube"], ["twitch", "Twitch"], ["discord", "Discord"], ["x", "X (Twitter)"], ["instagram", "Instagram"]
    ].map(function (n) {
      return '<li><a href="' + esc(lien(n[0])) + '" target="_blank" rel="noopener">' + ICON[n[0]] + n[1] + '</a></li>';
    }).join("");
    return '<footer class="foot"><div class="wrap">' +
      '<h2 class="cta-title">Prêt à rejoindre <em>la team ?</em></h2>' +
      '<a class="btn-pill" href="' + esc(lien("discord")) + '" target="_blank" rel="noopener">' + ICON.discord + 'Rejoindre le Discord</a>' +
      '<div class="cols">' +
        '<div class="about">' + logoHtml() +
          '<p>' + esc(SITE.nom) + ' est une chaîne YouTube multigaming.</p>' +
          '<p>Ce site est le cite officielle de LeNoobInconnu.</p></div>' +
        '<nav aria-label="Navigation"><h4>Navigation</h4><ul>' + nav + '</ul></nav>' +
        '<nav aria-label="Réseaux"><h4>Réseaux</h4><ul>' + nets + '</ul></nav>' +
        '<nav aria-label="Informations"><h4>Informations</h4><ul>' +
          '<li><a href="mentions.html#mentions">' + ICON.doc + 'Mentions légales</a></li>' +
          '<li><a href="mentions.html#confidentialite">' + ICON.shield + 'Confidentialité</a></li>' +
          '<li><a href="mentions.html#cookies">' + ICON.cookie + 'Cookies</a></li>' +
        '</ul></nav>' +
      '</div>' +
      '<div class="legal"><span>© ' + esc(SITE.nom) + ' — 2026</span><span>FR</span></div>' +
      '</div></footer>';
  }

  function renderVideo() {
    if (!SITE.videoId) {
      return '<div class="video-empty"><strong>Ta vidéo YouTube s\'affichera ici</strong>' +
        '<span>Ouvre <code>site.js</code> et colle l\'identifiant de ta vidéo dans <code>videoId</code>.</span></div>';
    }
    return '<iframe src="https://www.youtube.com/embed/' + encodeURIComponent(SITE.videoId) + '?rel=0" ' +
      'title="Vidéo YouTube ' + esc(SITE.nom) + '" loading="lazy" ' +
      'allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" ' +
      'referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>';
  }

  /* ------------------------------------------------------------------
     Projets
     ------------------------------------------------------------------ */
  function trouver(id) {
    var l = SITE.projets || [];
    for (var i = 0; i < l.length; i++) { if (l[i].id === id) return l[i]; }
    return null;
  }
  function lienProjet(p) { return p.lien || lien("youtube"); }
  function carteHtml(p) {
    var tag = p.id === SITE.projetMisEnAvant ? "À la une" : p.tag;
    return '<li><a class="card" style="background:' + esc(p.couleur || "#fff566") + '" href="' + esc(lienProjet(p)) + '" target="_blank" rel="noopener">' +
      '<span class="pill">' + esc(tag) + '</span><span class="num">' + esc(p.numero) + '</span>' +
      '<span><h3>' + esc(p.titre) + '</h3><p>' + esc(p.description) + '</p></span></a></li>';
  }
  function vedetteHtml(p) {
    return '<a class="featured" style="--c:' + esc(p.couleur || "#fff566") + '" href="' + esc(lienProjet(p)) + '" target="_blank" rel="noopener">' +
      '<div class="f-art" aria-hidden="true"><span class="f-num">' + esc(p.numero) + '</span></div>' +
      '<div class="f-body"><span class="pill">À la une</span><h3>' + esc(p.titre) + '</h3><p>' + esc(p.description) + '</p>' +
      '<span class="f-go">Voir le projet' + ICON.arrow + '</span></div></a>';
  }

  /* ------------------------------------------------------------------
     Carrousel de partenaires
     ------------------------------------------------------------------ */
  function avecVersion(u) {
    var v = SITE.versionImages;
    if (v == null || v === "") return u;
    return u + (u.indexOf("?") < 0 ? "?" : "&") + "v=" + encodeURIComponent(v);
  }
  function partenaireHtml(p, dup) {
    var inner = '<img src="' + esc(p.logo) + '" alt="" loading="lazy" onerror="this.parentNode.classList.add(\'no-img\')">' +
      '<span class="partner-name">' + esc(p.nom) + '</span>';
    var cls = 'partner';
    var li = dup ? '<li class="dup" aria-hidden="true">' : '<li>';
    if (p.lien) {
      return li + '<a class="' + cls + '" href="' + esc(p.lien) + '" target="_blank" rel="noopener"' + (dup ? ' tabindex="-1"' : '') + ' title="' + esc(p.nom) + '">' + inner + '</a></li>';
    }
    return li + '<div class="' + cls + '" title="' + esc(p.nom) + '">' + inner + '</div></li>';
  }
  function partenairesHtml() {
    var c = SITE.partenaires || {};
    var liste = c.liste || [];
    if (c.afficher === false || !liste.length) return "";
    // Nombre de logos nécessaires pour remplir l'écran (une case fait environ 260 px)
    var largeur = Math.max(window.innerWidth || 1200, 800);
    var fois = Math.max(1, Math.ceil((largeur / 260 + 1) / liste.length));
    var moitie = "", moitieDup = "", i, j;
    for (i = 0; i < fois; i++) {
      for (j = 0; j < liste.length; j++) { moitie += partenaireHtml(liste[j], false); moitieDup += partenaireHtml(liste[j], true); }
    }
    return '<div class="wrap"><p class="eyebrow">Affiliés</p><h2 class="h2">' + esc(c.titre || "Partenaires") + '</h2></div>' +
      '<div class="marquee' + (c.toujoursEnMouvement === false ? '' : ' force') + '" style="--duree:' + (Number(c.vitesse) || 30) + 's" aria-label="' + esc(c.titre || "Partenaires") + '">' +
      '<ul class="marquee-track">' + moitie + moitieDup + '</ul></div>' +
      (c.lienAffiliation ? '<div class="wrap"><a class="btn-solid" href="' + esc(c.lienAffiliation) + '" target="_blank" rel="noopener">Devenir affilié</a></div>' : '');
  }

  /* ------------------------------------------------------------------
     Maintenance
     ------------------------------------------------------------------ */
  function renderMaintenance(page) {
    var retour = page === "accueil" ? "" :
      '<a class="btn-solid" href="index.html">' + ICON.home + 'Retour à l\'accueil</a>';
    return '<section class="hero"><div class="wrap">' +
      '<p class="eyebrow">En travaux</p>' +
      '<h1 class="hero-title page-title">Page en <span>maintenance</span></h1>' +
      '<p class="page-sub">' + esc(SITE.messageMaintenance) + '</p>' + retour +
      '</div></section>';
  }

  /* ------------------------------------------------------------------
     Interface des réglages
     ------------------------------------------------------------------ */
  function majReglages() {
    var bt = document.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < bt.length; i++) {
      bt[i].setAttribute("aria-pressed", bt[i].getAttribute("data-theme-btn") === R.theme ? "true" : "false");
    }
    var cb = document.getElementById("reg-musique");
    var vol = document.getElementById("reg-volume");
    var etat = document.getElementById("reg-musique-etat");
    var note = document.getElementById("reg-note");
    if (!cb) return;
    var dispo = etatAudio === "ok" || etatAudio === "chargement";
    cb.disabled = !dispo;
    vol.disabled = !dispo;
    cb.checked = dispo && R.musique;
    vol.value = Math.round(R.volume * 100);
    etat.textContent = !dispo ? "Indisponible" : (R.musique ? "Activée" : "Désactivée");
    if (etatAudio === "absent") {
      note.hidden = false;
      note.textContent = "Aucun fichier trouvé. Ajoute " + (SITE.musique && SITE.musique.fichier) + " pour activer la musique.";
    } else if (etatAudio === "aucun") {
      note.hidden = false;
      note.textContent = "Aucune musique n'est configurée sur ce site.";
    } else {
      note.hidden = true;
    }
  }

  function brancherMenuMobile() {
    var m = document.getElementById("menu-mobile"), o = document.getElementById("menu-ouvrir"), f = document.getElementById("menu-fermer");
    if (!m || !o) return;
    function basculer(v) {
      m.hidden = !v; o.setAttribute("aria-expanded", v ? "true" : "false");
      document.documentElement.classList.toggle("menu-ouvert", v);
      if (v) f.focus(); else o.focus();
    }
    o.addEventListener("click", function () { basculer(true); });
    f.addEventListener("click", function () { basculer(false); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !m.hidden) basculer(false); });
    window.addEventListener("resize", function () { if (!m.hidden && window.innerWidth >= 900) basculer(false); });
    m.addEventListener("click", function (e) { if (e.target.closest(".mm-links a")) { m.hidden = true; document.documentElement.classList.remove("menu-ouvert"); } });
    document.addEventListener("lni:modal", function () { if (!m.hidden) { m.hidden = true; document.documentElement.classList.remove("menu-ouvert"); } });
  }

  function brancherReglages() {
    var btn = document.getElementById("btn-reglages");
    var panel = document.getElementById("panel-reglages");
    if (!btn || !panel) return;
    function ouvrir(o) { panel.hidden = !o; btn.setAttribute("aria-expanded", o ? "true" : "false"); }
    btn.addEventListener("click", function () { ouvrir(panel.hidden); });
    document.addEventListener("click", function (e) {
      if (!panel.hidden && !e.target.closest(".reg-wrap")) ouvrir(false);
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && !panel.hidden) { ouvrir(false); btn.focus(); }
    });
    var bt = panel.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < bt.length; i++) {
      bt[i].addEventListener("click", function () {
        R.theme = this.getAttribute("data-theme-btn");
        appliquerTheme(); sauver(); majReglages();
      });
    }
    document.getElementById("reg-musique").addEventListener("change", function () { basculerMusique(this.checked); });
    document.getElementById("reg-volume").addEventListener("input", function () {
      R.volume = this.value / 100;
      if (audio) audio.volume = R.volume;
      sauver();
    });
    majReglages();
  }

  /* ------------------------------------------------------------------
     Démarrage
     ------------------------------------------------------------------ */
  initMusique();
  /* Icône de l'onglet : on essaie le favicon, puis le logo */
  function initFavicon() {
    var cands = [SITE.favicon, SITE.logo].filter(Boolean).map(avecVersion);
    (function essayer(i) {
      if (i >= cands.length) return;
      var t = new Image();
      t.onload = function () {
        var vieux = document.querySelectorAll('link[rel~="icon"]');
        for (var k = 0; k < vieux.length; k++) vieux[k].parentNode.removeChild(vieux[k]);
        var l = document.createElement("link");
        l.rel = "icon"; l.href = cands[i];
        document.head.appendChild(l);
      };
      t.onerror = function () { essayer(i + 1); };
      t.src = cands[i];
    })(0);
  }

  initFavicon();

  document.addEventListener("DOMContentLoaded", function () {
    var page = document.body.getAttribute("data-page");

    if (SITE.maintenance && SITE.maintenance[page]) {
      var main = document.querySelector("main");
      if (main) main.innerHTML = renderMaintenance(page);
    }

    var h = document.getElementById("site-header");
    var f = document.getElementById("site-footer");
    var v = document.getElementById("video-slot");
    if (h) h.outerHTML = renderHeader(page);
    if (f) f.outerHTML = renderFooter();
    if (v) v.innerHTML = renderVideo();

    // Projet à la une
    var vedette = document.getElementById("projet-vedette");
    if (vedette) {
      var pv = trouver(SITE.projetMisEnAvant);
      if (pv) { vedette.innerHTML = vedetteHtml(pv); }
      else { var sv = document.getElementById("section-vedette"); if (sv) sv.hidden = true; }
    }
    // Projets de l'accueil
    var pa = document.getElementById("projets-accueil");
    if (pa) {
      var items = (SITE.projetsAccueil || []).map(trouver).filter(Boolean);
      if (items.length) { pa.innerHTML = items.map(carteHtml).join(""); }
      else { var sp = document.getElementById("section-projets"); if (sp) sp.hidden = true; }
    }
    // Tous les projets (page Séries)
    var all = document.getElementById("projets-all");
    if (all) all.innerHTML = (SITE.projets || []).map(carteHtml).join("");
    // Partenaires
    var part = document.getElementById("section-partenaires");
    if (part) {
      var ph = partenairesHtml();
      if (ph) { part.innerHTML = ph; } else { part.hidden = true; }
    }

    var ax = document.querySelector(".annonce-x");
    if (ax) {
      ax.addEventListener("click", function () {
        try { localStorage.setItem(CLE_ANNONCE, (SITE.annonce || {}).texte); } catch (e) {}
        var bar = document.querySelector(".annonce");
        if (bar) bar.remove();
      });
    }

    document.querySelectorAll("[data-link]").forEach(function (a) {
      var url = lien(a.getAttribute("data-link"));
      if (url) a.setAttribute("href", url);
    });
    document.querySelectorAll("[data-icon]").forEach(function (el) {
      el.insertAdjacentHTML("afterbegin", ICON[el.getAttribute("data-icon")] || "");
    });
    var mail = document.getElementById("email-slot");
    if (mail) {
      if (SITE.email) { mail.querySelector("strong").textContent = SITE.email; } else { mail.hidden = true; }
    }

    brancherReglages();
    brancherMenuMobile();

    // Système de connexion (avec le serveur s'il est configuré)
    if (SITE.connexion && SITE.connexion.actif) {
      var lancerAuth = function () {
        var sa = document.createElement("script");
        sa.src = "auth.js";
        document.body.appendChild(sa);
      };
      var avecServeur = SITE.serveur && SITE.serveur.url;
      if (avecServeur && !window.LNI) {
        var sv = document.createElement("script");
        sv.src = "serveur.js";
        sv.onload = function () { window.LNI.ready.then(lancerAuth); };
        sv.onerror = lancerAuth;
        document.body.appendChild(sv);
      } else if (avecServeur) {
        window.LNI.ready.then(lancerAuth);
      } else { lancerAuth(); }
    }

    // Annonces et questionnaires (accueil)
    if (document.getElementById("section-annonces") && SITE.actualites && SITE.actualites.actif && SITE.actualites.urlApi) {
      var sn = document.createElement("script");
      sn.src = "annonces.js";
      document.body.appendChild(sn);
    }

    // Chatbot (chargé seulement s'il est activé et que la page n'est pas en maintenance)
    var cb = SITE.chatbot || {};
    if (cb.actif && !(SITE.maintenance && SITE.maintenance[page])) {
      var s = document.createElement("script");
      s.src = "chatbot.js";
      document.body.appendChild(s);
    }
  });
})();
