/* Annonces et questionnaires de l'accueil (les données vivent dans le Worker, voir worker-annonces.js) */
(function () {
  "use strict";
  var C = SITE.actualites || {};
  var zone = document.getElementById("section-annonces");
  if (!zone || !C.actif || !C.urlApi) return;
  var API = C.urlApi.replace(/\/+$/, "");
  var contenu = document.getElementById("annonces-contenu");
  var barre = document.getElementById("adm-bar");
  var etat = { data: null, moi: null, expire: false, resultats: {}, ouverts: {}, erreur: "" };
  var dernierJeton = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function paras(s) { return esc(s).replace(/\n/g, "<br>"); }
  function date(t) { try { return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } }
  function session() { try { return JSON.parse(localStorage.getItem("lni_session")); } catch (e) { return null; } }
  function jeton() { var s = session(); return s && s.jeton ? (s.fournisseur === "google" ? "Google " : "Discord ") + s.jeton : ""; }
  function admin() { return !!(etat.moi && etat.moi.admin); }

  function appel(methode, chemin, corps) {
    var h = {}, j = jeton();
    if (j) h.Authorization = j;
    if (corps) h["Content-Type"] = "application/json";
    return fetch(API + chemin, { method: methode, headers: h, body: corps ? JSON.stringify(corps) : undefined }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) { var e = new Error(d.erreur || "Erreur du serveur"); e.status = r.status; throw e; }
        return d;
      });
    });
  }

  /* ----- Chargement ----- */
  function charger() {
    dernierJeton = jeton();
    etat.expire = false;
    var pub = appel("GET", "/api/contenu").then(function (d) { etat.data = d; etat.erreur = ""; }, function () { etat.erreur = "Impossible de charger les annonces pour le moment."; });
    var moi = dernierJeton ? appel("GET", "/api/moi").then(function (d) { etat.moi = d; }, function (e) { etat.moi = null; if (e.status === 401) etat.expire = true; }) : (etat.moi = null, Promise.resolve());
    return Promise.all([pub, moi]).then(dessiner);
  }
  document.addEventListener("lni:session", function () { if (jeton() !== dernierJeton) charger(); });

  /* ----- Affichage ----- */
  function annonceHtml(a) {
    return '<article class="annonce-carte"><p class="ac-date">' + esc(date(a.date)) + '</p><h3>' + esc(a.titre) + '</h3>' +
      (a.texte ? '<p>' + paras(a.texte) + '</p>' : '') +
      (a.lien ? '<a class="ac-lien" href="' + esc(a.lien) + '" target="_blank" rel="noopener">En savoir plus' + ICON.arrow + '</a>' : '') +
      (admin() ? '<button class="mini danger" type="button" data-act="suppr-annonce" data-id="' + esc(a.id) + '">Supprimer</button>' : '') + '</article>';
  }

  function champHtml(q, qid) {
    var nom = "q-" + qid + "-" + q.id, h = '<fieldset class="qf"><legend>' + esc(q.texte) + '</legend>';
    if (q.type === "texte") return h + '<textarea name="' + nom + '" rows="2" maxlength="500"></textarea></fieldset>';
    var t = q.type === "unique" ? "radio" : "checkbox";
    q.options.forEach(function (o) { h += '<label class="opt"><input type="' + t + '" name="' + nom + '" value="' + esc(o) + '"><span>' + esc(o) + '</span></label>'; });
    return h + '</fieldset>';
  }

  function resultatsHtml(r) {
    var h = '<div class="res"><p class="res-total">' + r.total + ' réponse' + (r.total > 1 ? 's' : '') + '</p>';
    r.questions.forEach(function (q) {
      h += '<div class="res-q"><h4>' + esc(q.texte) + '</h4>';
      if (q.type === "texte") {
        h += q.textes.length ? '<ul class="res-textes">' + q.textes.map(function (t) { return '<li><strong>' + esc(t.nom) + ' :</strong> ' + esc(t.texte) + '</li>'; }).join("") + '</ul>' : '<p class="res-vide">Réponses libres visibles uniquement par les admins.</p>';
      } else {
        var tot = 0; Object.keys(q.compte).forEach(function (o) { tot = Math.max(tot, q.compte[o]); });
        Object.keys(q.compte).forEach(function (o) {
          var n = q.compte[o], pct = r.total ? Math.round(n * 100 / r.total) : 0;
          h += '<div class="barre"><span class="b-nom">' + esc(o) + '</span><span class="b-piste"><span style="width:' + pct + '%"></span></span><span class="b-val">' + n + ' (' + pct + '%)</span></div>';
        });
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  function questHtml(q) {
    var s = session(), connecte = !!(s && s.jeton), repondu = !!(etat.moi && etat.moi.repondus.indexOf(q.id) >= 0);
    var h = '<article class="annonce-carte quest"><p class="ac-date">Questionnaire · ' + esc(date(q.date)) + ' · <span class="etat ' + (q.ouvert ? 'ouvert' : 'clos') + '">' + (q.ouvert ? 'Ouvert' : 'Clos') + '</span></p><h3>' + esc(q.titre) + '</h3>' +
      (q.description ? '<p>' + paras(q.description) + '</p>' : '');
    if (repondu) h += '<p class="merci">Merci, tu as déjà répondu.</p>';
    else if (!q.ouvert) h += '<p class="merci">Ce questionnaire est clos.</p>';
    else if (!connecte || etat.expire) h += '<p class="merci">' + (etat.expire ? 'Ta connexion a expiré. ' : '') + 'Connecte-toi avec Discord ou Google pour répondre.</p><button class="mini" type="button" data-act="connexion">Se connecter</button>';
    else if (etat.ouverts[q.id]) {
      h += '<form class="qform" data-quest="' + esc(q.id) + '" novalidate>' + q.questions.map(function (x) { return champHtml(x, q.id); }).join("") +
        '<p class="form-err" role="alert"></p><button class="mini plein" type="submit">Envoyer mes réponses</button></form>';
    } else h += '<button class="mini plein" type="button" data-act="repondre" data-id="' + esc(q.id) + '">Répondre</button>';
    var peutVoir = q.resultatsPublics || admin();
    var actions = '';
    if (peutVoir) actions += '<button class="mini" type="button" data-act="resultats" data-id="' + esc(q.id) + '">' + (etat.resultats[q.id] ? 'Masquer' : 'Voir') + ' les résultats</button>';
    if (admin()) actions += '<button class="mini" type="button" data-act="toggle-quest" data-id="' + esc(q.id) + '" data-ouvert="' + (q.ouvert ? '0' : '1') + '">' + (q.ouvert ? 'Clore' : 'Rouvrir') + '</button><button class="mini danger" type="button" data-act="suppr-quest" data-id="' + esc(q.id) + '">Supprimer</button>';
    if (actions) h += '<div class="ac-actions">' + actions + '</div>';
    if (etat.resultats[q.id]) h += etat.resultats[q.id].erreur ? '<p class="form-err">' + esc(etat.resultats[q.id].erreur) + '</p>' : resultatsHtml(etat.resultats[q.id]);
    return h + '</article>';
  }

  function dessiner() {
    var d = etat.data || { annonces: [], questionnaires: [] };
    var vide = !d.annonces.length && !d.questionnaires.length;
    zone.hidden = vide && !admin() && !etat.erreur;
    barre.hidden = !admin();
    if (admin()) barre.innerHTML = '<button class="mini plein" type="button" data-act="nouvelle-annonce">+ Nouvelle annonce</button><button class="mini plein" type="button" data-act="nouveau-quest">+ Nouveau questionnaire</button><span class="adm-badge">Mode administrateur</span>';
    var h = etat.erreur ? '<p class="form-err">' + esc(etat.erreur) + '</p>' : '';
    if (etat.expire) h += '<p class="form-err">Ta connexion a expiré, reconnecte-toi pour répondre ou administrer.</p>';
    if (vide && admin()) h += '<p class="res-vide">Rien de publié pour l\'instant. Utilise les boutons ci-dessus.</p>';
    h += '<div class="annonces-grille">' + d.annonces.map(annonceHtml).join("") + d.questionnaires.map(questHtml).join("") + '</div>';
    contenu.innerHTML = h;
  }

  /* ----- Actions ----- */
  function recharger() { return charger(); }
  function echec(e) {
    if (e.status === 401) { etat.expire = true; dessiner(); return; }
    alert(e.message || "Une erreur est survenue.");
  }
  function seConnecter() { var b = document.querySelector(".js-compte"); if (b) b.click(); }

  zone.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "connexion") seConnecter();
    else if (act === "repondre") { etat.ouverts[id] = true; dessiner(); }
    else if (act === "resultats") {
      if (etat.resultats[id]) { delete etat.resultats[id]; dessiner(); return; }
      appel("GET", "/api/resultats/" + encodeURIComponent(id)).then(function (r) { etat.resultats[id] = r; dessiner(); }, function (er) { etat.resultats[id] = { erreur: er.message }; dessiner(); });
    }
    else if (act === "suppr-annonce") { if (confirm("Supprimer cette annonce ?")) appel("DELETE", "/api/annonces/" + encodeURIComponent(id)).then(recharger, echec); }
    else if (act === "suppr-quest") { if (confirm("Supprimer ce questionnaire et toutes ses réponses ?")) appel("DELETE", "/api/questionnaires/" + encodeURIComponent(id)).then(recharger, echec); }
    else if (act === "toggle-quest") appel("PATCH", "/api/questionnaires/" + encodeURIComponent(id), { ouvert: b.getAttribute("data-ouvert") === "1" }).then(recharger, echec);
    else if (act === "nouvelle-annonce") formAnnonce();
    else if (act === "nouveau-quest") formQuestionnaire();
  });

  zone.addEventListener("submit", function (e) {
    var f = e.target.closest("form.qform");
    if (!f) return;
    e.preventDefault();
    var id = f.getAttribute("data-quest"), q = etat.data.questionnaires.filter(function (x) { return x.id === id; })[0], rep = {}, err = f.querySelector(".form-err");
    for (var i = 0; i < q.questions.length; i++) {
      var qu = q.questions[i], els = f.querySelectorAll('[name="q-' + id + '-' + qu.id + '"]');
      if (qu.type === "texte") rep[qu.id] = els[0].value;
      else {
        var cochees = Array.prototype.filter.call(els, function (x) { return x.checked; }).map(function (x) { return x.value; });
        if (qu.type === "unique") { if (!cochees.length) { err.textContent = "Réponds à : « " + qu.texte + " »"; return; } rep[qu.id] = cochees[0]; }
        else rep[qu.id] = cochees;
      }
    }
    f.querySelector("[type=submit]").disabled = true;
    appel("POST", "/api/reponses/" + encodeURIComponent(id), { reponses: rep }).then(function () { delete etat.ouverts[id]; return recharger(); }, function (er) {
      f.querySelector("[type=submit]").disabled = false;
      if (er.status === 401) echec(er); else err.textContent = er.message;
    });
  });

  /* ----- Formulaires admin ----- */
  function fenetre(titre, corps, surEnvoi) {
    var fond = document.createElement("div");
    fond.className = "modal-fond";
    fond.innerHTML = '<div class="modal modal-large" role="dialog" aria-modal="true"><button class="modal-x" type="button" aria-label="Fermer">' + ICON.close + '</button><h2>' + esc(titre) + '</h2><form novalidate>' + corps + '<p class="form-err" role="alert"></p><button class="btn-login" type="submit">Publier</button></form></div>';
    document.body.appendChild(fond);
    var form = fond.querySelector("form"), err = fond.querySelector(".form-err");
    function fermer() { document.removeEventListener("keydown", touche); fond.remove(); }
    function touche(ev) { if (ev.key === "Escape") fermer(); }
    document.addEventListener("keydown", touche);
    fond.addEventListener("mousedown", function (ev) { if (ev.target === fond) fermer(); });
    fond.querySelector(".modal-x").addEventListener("click", fermer);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var btn = form.querySelector(".btn-login"); btn.disabled = true;
      Promise.resolve(surEnvoi(form)).then(function () { fermer(); return recharger(); }, function (er) {
        btn.disabled = false; err.textContent = typeof er === "string" ? er : (er.message || "Erreur");
        if (er && er.status === 401) { fermer(); echec(er); }
      });
    });
    var premier = form.querySelector("input, textarea"); if (premier) premier.focus();
    return form;
  }

  function formAnnonce() {
    fenetre("Nouvelle annonce",
      '<label>Titre<input name="titre" maxlength="120" required></label>' +
      '<label>Texte<textarea name="texte" rows="5" maxlength="2000"></textarea></label>' +
      '<label>Lien (facultatif)<input name="lien" type="url" placeholder="https://..."></label>',
      function (f) {
        if (!f.titre.value.trim()) return Promise.reject("Le titre est obligatoire.");
        return appel("POST", "/api/annonces", { titre: f.titre.value, texte: f.texte.value, lien: f.lien.value });
      });
  }

  function formQuestionnaire() {
    var n = 0;
    var form = fenetre("Nouveau questionnaire",
      '<label>Titre<input name="titre" maxlength="120" required></label>' +
      '<label>Description (facultatif)<textarea name="description" rows="2" maxlength="500"></textarea></label>' +
      '<label class="coche"><input type="checkbox" name="publics"> Résultats visibles par tout le monde</label>' +
      '<div class="qs"></div><button class="mini" type="button" data-ajout>+ Ajouter une question</button>',
      function (f) {
        var qs = [];
        var blocs = f.querySelectorAll(".qb");
        for (var i = 0; i < blocs.length; i++) {
          var b = blocs[i], type = b.querySelector("select").value;
          qs.push({ texte: b.querySelector(".qt").value, type: type, options: type === "texte" ? [] : b.querySelector(".qo").value.split("\n") });
        }
        return appel("POST", "/api/questionnaires", { titre: f.titre.value, description: f.description.value, resultatsPublics: f.publics.checked, questions: qs });
      });
    function ajouter() {
      if (form.querySelectorAll(".qb").length >= 10) return;
      n++;
      var d = document.createElement("div");
      d.className = "qb";
      d.innerHTML = '<label>Question ' + n + '<input class="qt" maxlength="200"></label>' +
        '<label>Type<select><option value="unique">Choix unique</option><option value="multiple">Choix multiples</option><option value="texte">Réponse libre</option></select></label>' +
        '<label class="lo">Options (une par ligne)<textarea class="qo" rows="3"></textarea></label>';
      d.querySelector("select").addEventListener("change", function () { d.querySelector(".lo").hidden = this.value === "texte"; });
      form.querySelector(".qs").appendChild(d);
    }
    form.querySelector("[data-ajout]").addEventListener("click", ajouter);
    ajouter();
  }

  charger();
})();
