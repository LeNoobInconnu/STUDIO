/* Outils communs : appels au serveur, publications, commentaires et likes (utilisé par toutes les pages sociales) */
(function () {
  "use strict";
  var ouverts = {}; // publications dont les commentaires sont ouverts

  function base() { return SITE.actualites && SITE.actualites.urlApi ? SITE.actualites.urlApi.replace(/\/+$/, "") : ""; }
  function session() { try { return JSON.parse(localStorage.getItem("lni_session")) || null; } catch (e) { return null; } }
  function connecte() { var s = session(); return !!(s && s.jeton); }
  function entete() { var s = session(); return s && s.jeton ? { Authorization: (s.fournisseur === "google" ? "Google " : "Discord ") + s.jeton } : {}; }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function date(t) { try { return new Date(t).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); } catch (e) { return ""; } }
  function alerter(e) { alert(e && e.message ? e.message : "Une erreur est survenue."); }
  function ouvrirConnexion() { document.dispatchEvent(new Event("lni:ouvrir-connexion")); }
  function lienProfil(a) { return "profil.html?id=" + encodeURIComponent(a.id); }

  function appel(methode, chemin, corps) {
    var h = entete();
    if (corps !== undefined) h["Content-Type"] = "application/json";
    return fetch(base() + chemin, { method: methode, headers: h, body: corps !== undefined ? JSON.stringify(corps) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (!r.ok) { var e = new Error(r.status === 401 ? "Ta connexion a expiré : reconnecte-toi." : (d.erreur || "Erreur du serveur")); e.status = r.status; throw e; }
          return d;
        });
      });
  }

  function avatar(url, cls) {
    return url ? '<img class="' + (cls || "av") + '" src="' + esc(url) + '" alt="" referrerpolicy="no-referrer" loading="lazy">'
      : '<span class="' + (cls || "av") + ' av-vide" aria-hidden="true"></span>';
  }

  /* ----- Commentaires (sur une publication ou une annonce) ----- */
  function commentaires(tid, el) {
    el.innerHTML = '<div class="com"><div class="com-liste"><p class="com-note">Chargement…</p></div>' +
      (connecte()
        ? '<form class="com-form" novalidate><textarea rows="1" maxlength="300" placeholder="Ajouter un commentaire…" aria-label="Commentaire"></textarea><button class="mini plein" type="submit">Envoyer</button><p class="form-err" role="alert"></p></form>'
        : '<p class="com-note"><button class="lien-btn" type="button" data-login>Connecte-toi</button> pour commenter et liker.</p>') +
      '</div>';
    var liste = el.querySelector(".com-liste");
    var chemin = "/api/commentaires/" + encodeURIComponent(tid);
    function dessiner(coms) {
      liste.innerHTML = coms.length ? coms.map(function (c) {
        return '<div class="com-item">' + avatar(c.auteur.avatar, "av av-s") +
          '<div class="com-corps"><div class="com-tete"><a href="' + lienProfil(c.auteur) + '">' + esc(c.auteur.pseudo) + '</a><span>' + esc(date(c.date)) + '</span></div>' +
          '<p>' + esc(c.texte).replace(/\n/g, "<br>") + '</p>' +
          '<div class="com-actions"><button class="like' + (c.jAime ? " on" : "") + '" type="button" data-like="' + esc(c.id) + '" aria-pressed="' + (c.jAime ? "true" : "false") + '" aria-label="J\'aime">♥ ' + c.aime + '</button>' +
          (c.peutSupprimer ? '<button class="lien-btn danger" type="button" data-suppr="' + esc(c.id) + '">Supprimer</button>' : "") + '</div></div></div>';
      }).join("") : '<p class="com-note">Aucun commentaire pour l\'instant.</p>';
    }
    function charger() {
      return appel("GET", chemin).then(function (d) { dessiner(d.commentaires); }, function (e) { liste.innerHTML = '<p class="form-err">' + esc(e.message) + '</p>'; });
    }
    el.addEventListener("click", function (e) {
      var l = e.target.closest("[data-like]"), s = e.target.closest("[data-suppr]"), lg = e.target.closest("[data-login]");
      if (lg) { ouvrirConnexion(); return; }
      if (l) { appel("POST", chemin + "/" + encodeURIComponent(l.getAttribute("data-like")) + "/aime").then(charger, alerter); return; }
      if (s && confirm("Supprimer ce commentaire ?")) appel("DELETE", chemin + "/" + encodeURIComponent(s.getAttribute("data-suppr"))).then(charger, alerter);
    });
    var f = el.querySelector(".com-form");
    if (f) f.addEventListener("submit", function (e) {
      e.preventDefault();
      var t = f.querySelector("textarea"), err = f.querySelector(".form-err"), btn = f.querySelector("button");
      if (!t.value.trim()) { err.textContent = "Écris un commentaire."; return; }
      btn.disabled = true;
      appel("POST", chemin, { texte: t.value }).then(function () { t.value = ""; err.textContent = ""; btn.disabled = false; charger(); },
        function (er) { btn.disabled = false; err.textContent = er.message; });
    });
    charger();
  }

  /* ----- Publications ----- */
  function carte(p) {
    var a = p.auteur || { id: "", pseudo: "Joueur", avatar: "" };
    return '<article class="post">' +
      '<header class="post-tete"><a class="post-auteur" href="' + lienProfil(a) + '">' + avatar(a.avatar, "av") +
      '<span><strong>' + esc(a.pseudo) + '</strong><small>' + esc(date(p.date)) + '</small></span></a>' +
      (p.peutSupprimer ? '<button class="lien-btn danger" type="button" data-post-suppr="' + esc(p.id) + '">Supprimer</button>' : "") + '</header>' +
      (p.texte ? '<p class="post-texte">' + esc(p.texte).replace(/\n/g, "<br>") + '</p>' : "") +
      (p.image ? '<img class="post-img" src="' + esc(p.image) + '" alt="" loading="lazy">' : "") +
      '<footer class="post-actions">' +
        '<button class="like' + (p.jAime ? " on" : "") + '" type="button" data-post-like="' + esc(p.id) + '" aria-pressed="' + (p.jAime ? "true" : "false") + '" aria-label="J\'aime">♥ ' + p.aime + '</button>' +
        '<button class="mini" type="button" data-com-toggle="' + esc(p.id) + '" aria-expanded="' + (ouverts[p.id] ? "true" : "false") + '">Commentaires · ' + p.commentaires + '</button>' +
      '</footer>' +
      '<div class="post-coms" data-com-box="' + esc(p.id) + '"' + (ouverts[p.id] ? "" : " hidden") + '></div>' +
    '</article>';
  }

  // Affiche une liste de publications dans "zone" et ouvre les commentaires déjà ouverts
  function publier(zone, posts, recharger) {
    if (!zone._branche) {
      zone._branche = true;
      zone.addEventListener("click", function (e) {
        var t;
        if ((t = e.target.closest("[data-login]"))) return ouvrirConnexion();
        if ((t = e.target.closest("[data-post-like]"))) {
          if (!connecte()) return ouvrirConnexion();
          appel("POST", "/api/posts/" + encodeURIComponent(t.getAttribute("data-post-like")) + "/aime").then(function () { zone._recharger(); }, alerter);
          return;
        }
        if ((t = e.target.closest("[data-post-suppr]"))) {
          if (confirm("Supprimer cette publication ?")) appel("DELETE", "/api/posts/" + encodeURIComponent(t.getAttribute("data-post-suppr"))).then(function () { zone._recharger(); }, alerter);
          return;
        }
        if ((t = e.target.closest("[data-com-toggle]"))) {
          var id = t.getAttribute("data-com-toggle"), box = zone.querySelector('[data-com-box="' + id + '"]');
          if (!box) return;
          box.hidden = !box.hidden;
          ouverts[id] = !box.hidden;
          t.setAttribute("aria-expanded", ouverts[id] ? "true" : "false");
          if (!box.hidden && !box.dataset.pret) { box.dataset.pret = "1"; commentaires("post:" + id, box); }
        }
      });
    }
    zone._recharger = recharger;
    zone.innerHTML = posts.length ? posts.map(carte).join("") : '<p class="com-note vide-fil">Rien à afficher pour l\'instant.</p>';
    // Les zones de commentaires ouvertes sont rechargées après le rendu
    posts.forEach(function (p) {
      if (ouverts[p.id]) { var box = zone.querySelector('[data-com-box="' + p.id + '"]'); if (box) { box.dataset.pret = "1"; commentaires("post:" + p.id, box); } }
    });
  }

  // Compose une publication (texte + image facultative)
  function imageVersDataUrl(fichier) {
    return new Promise(function (ok, ko) {
      var fr = new FileReader();
      fr.onerror = ko;
      fr.onload = function () {
        var img = new Image();
        img.onerror = ko;
        img.onload = function () {
          var cote = 800, qualite = 0.8, url = "";
          for (var i = 0; i < 4; i++) {
            var k = Math.min(1, cote / Math.max(img.width, img.height));
            var c = document.createElement("canvas");
            c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
            c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
            url = c.toDataURL("image/jpeg", qualite);
            if (url.length <= 280000) break;
            cote = Math.round(cote * 0.7); qualite = Math.max(0.5, qualite - 0.1);
          }
          if (url.length > 300000) return ko(new Error("Image trop lourde."));
          ok(url);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(fichier);
    });
  }

  function composeur(el, surPublie) {
    if (!connecte()) {
      el.innerHTML = '<div class="compo-vide"><p>Connecte-toi avec Discord ou Google pour publier.</p>' +
        '<button class="mini plein" type="button" data-login>Se connecter</button></div>';
      el.querySelector("[data-login]").addEventListener("click", ouvrirConnexion);
      return;
    }
    el.innerHTML = '<form class="compo" novalidate>' +
      '<textarea rows="3" maxlength="500" placeholder="Quoi de neuf ?" aria-label="Ta publication"></textarea>' +
      '<div class="compo-apercu" hidden><img alt=""><button class="lien-btn danger" type="button" data-retirer>Retirer l\'image</button></div>' +
      '<div class="compo-bas"><label class="mini compo-image">Ajouter une image<input type="file" accept="image/*" hidden></label>' +
      '<span class="compte-car">0 / 500</span><button class="mini plein" type="submit">Publier</button></div>' +
      '<p class="form-err" role="alert"></p></form>';
    var f = el.querySelector("form"), t = f.querySelector("textarea"), err = f.querySelector(".form-err"), image = "";
    var apercu = f.querySelector(".compo-apercu");
    t.addEventListener("input", function () { f.querySelector(".compte-car").textContent = t.value.length + " / 500"; });
    f.querySelector("input[type=file]").addEventListener("change", function () {
      var fichier = this.files[0];
      if (!fichier) return;
      imageVersDataUrl(fichier).then(function (d) {
        image = d; apercu.hidden = false; apercu.querySelector("img").src = d; err.textContent = "";
      }, function () { err.textContent = "Impossible d'utiliser cette image (trop lourde ?)."; });
    });
    apercu.querySelector("[data-retirer]").addEventListener("click", function () { image = ""; apercu.hidden = true; f.querySelector("input[type=file]").value = ""; });
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!t.value.trim() && !image) { err.textContent = "Écris quelque chose ou ajoute une image."; return; }
      var btn = f.querySelector(".mini.plein");
      btn.disabled = true;
      appel("POST", "/api/posts", { texte: t.value, image: image }).then(function () {
        t.value = ""; image = ""; apercu.hidden = true; f.querySelector(".compte-car").textContent = "0 / 500";
        btn.disabled = false; err.textContent = "";
        if (surPublie) surPublie();
      }, function (er) { btn.disabled = false; err.textContent = er.message; });
    });
  }

  window.LNI_COMMUN = {
    base: base, session: session, connecte: connecte, appel: appel, esc: esc, date: date, alerter: alerter,
    ouvrirConnexion: ouvrirConnexion, lienProfil: lienProfil, avatar: avatar,
    commentaires: commentaires, publier: publier, composeur: composeur, imageVersDataUrl: imageVersDataUrl
  };
})();
