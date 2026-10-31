/* Annonces et questionnaires de l'accueil. Résultats et vote toujours visibles, commentaires sur les annonces. */
(function () {
  "use strict";
  var C = SITE.actualites || {};
  var zone = document.getElementById("section-annonces");
  if (!zone || !C.actif || !C.urlApi) return;
  var K = window.LNI_COMMUN;
  var contenu = document.getElementById("annonces-contenu");
  var barre = document.getElementById("adm-bar");
  var data = null, moi = null, erreur = "", dernier = null;

  function admin() { return !!(moi && moi.admin); }
  function date(t) { try { return new Date(t).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }); } catch (e) { return ""; } }
  function paras(s) { return K.esc(s).replace(/\n/g, "<br>"); }

  function charger() {
    dernier = K.session() && K.session().jeton || null;
    var pub = K.appel("GET", "/api/contenu").then(function (d) { data = d; erreur = ""; }, function () { erreur = "Impossible de charger les annonces pour le moment."; });
    var m = K.connecte() ? K.appel("GET", "/api/moi").then(function (d) { moi = d; }, function () { moi = null; }) : (moi = null, Promise.resolve());
    return Promise.all([pub, m]).then(dessiner);
  }
  document.addEventListener("lni:session", function () {
    var j = K.session() && K.session().jeton || null;
    if (j !== dernier) charger();
  });

  /* ----- Résultats : toujours affichés ----- */
  function resultatsHtml(r) {
    if (!r || !r.total) return '<p class="res-vide">Aucune réponse pour l\'instant.</p>';
    var h = '<div class="res"><p class="res-total">' + r.total + ' réponse' + (r.total > 1 ? "s" : "") + '</p>';
    r.questions.forEach(function (q) {
      h += '<div class="res-q"><h4>' + K.esc(q.texte) + '</h4>';
      if (q.type === "texte") {
        h += q.textes.length ? '<ul class="res-textes">' + q.textes.map(function (t) { return '<li><strong>' + K.esc(t.nom) + ' :</strong> ' + K.esc(t.texte) + '</li>'; }).join("") + '</ul>' : '<p class="res-vide">Aucune réponse.</p>';
      } else {
        Object.keys(q.compte).forEach(function (o) {
          var n = q.compte[o], pct = r.total ? Math.round(n * 100 / r.total) : 0;
          h += '<div class="barre"><span class="b-nom">' + K.esc(o) + '</span><span class="b-piste"><span style="width:' + pct + '%"></span></span><span class="b-val">' + n + ' (' + pct + '%)</span></div>';
        });
      }
      h += '</div>';
    });
    return h + '</div>';
  }

  /* ----- Vote : formulaire toujours visible tant qu'on n'a pas voté ----- */
  function formHtml(q) {
    return '<form class="qform" data-quest="' + K.esc(q.id) + '" novalidate>' + q.questions.map(function (x) {
      var nom = "q-" + q.id + "-" + x.id;
      if (x.type === "texte") return '<fieldset class="qf"><legend>' + K.esc(x.texte) + '</legend><textarea name="' + nom + '" rows="2" maxlength="500" aria-label="' + K.esc(x.texte) + '"></textarea></fieldset>';
      var t = x.type === "unique" ? "radio" : "checkbox";
      return '<fieldset class="qf"><legend>' + K.esc(x.texte) + '</legend>' + x.options.map(function (o) {
        return '<label class="opt"><input type="' + t + '" name="' + nom + '" value="' + K.esc(o) + '"><span>' + K.esc(o) + '</span></label>';
      }).join("") + '</fieldset>';
    }).join("") + '<p class="form-err" role="alert"></p><button class="mini plein" type="submit">Envoyer mes réponses</button></form>';
  }

  function questHtml(q) {
    var repondu = !!(moi && moi.repondus && moi.repondus.indexOf(q.id) >= 0);
    var h = '<article class="annonce-carte quest"><p class="ac-date">Questionnaire · ' + date(q.date) + ' · <span class="etat ' + (q.ouvert ? "ouvert" : "clos") + '">' + (q.ouvert ? "Ouvert" : "Clos") + '</span></p>' +
      '<h3>' + K.esc(q.titre) + '</h3>' + (q.description ? '<p>' + paras(q.description) + '</p>' : "") + resultatsHtml(q.resultats);
    if (q.ouvert) {
      if (!K.connecte()) h += '<button class="mini plein" type="button" data-act="connexion">Connecte-toi pour voter</button>';
      else if (repondu) h += '<p class="merci">Merci, tu as déjà voté.</p>';
      else h += formHtml(q);
    }
    if (admin()) {
      h += '<div class="ac-actions"><button class="mini" type="button" data-act="toggle-quest" data-id="' + K.esc(q.id) + '" data-ouvert="' + (q.ouvert ? "0" : "1") + '">' + (q.ouvert ? "Clore" : "Rouvrir") + '</button>' +
        '<button class="mini danger" type="button" data-act="suppr-quest" data-id="' + K.esc(q.id) + '">Supprimer</button></div>';
    }
    return h + '</article>';
  }

  /* ----- Annonces : avec commentaires ----- */
  function annonceHtml(a) {
    return '<article class="annonce-carte"><p class="ac-date">' + date(a.date) + '</p><h3>' + K.esc(a.titre) + '</h3>' +
      (a.texte ? '<p>' + paras(a.texte) + '</p>' : "") +
      (a.lien ? '<a class="ac-lien" href="' + K.esc(a.lien) + '" target="_blank" rel="noopener">En savoir plus</a>' : "") +
      (admin() ? '<div class="ac-actions"><button class="mini danger" type="button" data-act="suppr-annonce" data-id="' + K.esc(a.id) + '">Supprimer</button></div>' : "") +
      '<div class="ac-com" data-annonce="' + K.esc(a.id) + '"></div></article>';
  }

  function dessiner() {
    var d = data || { annonces: [], questionnaires: [] };
    var vide = !d.annonces.length && !d.questionnaires.length;
    zone.hidden = vide && !admin() && !erreur;
    barre.hidden = !admin();
    if (admin()) barre.innerHTML = '<button class="mini plein" type="button" data-act="nouvelle-annonce">+ Nouvelle annonce</button><button class="mini plein" type="button" data-act="nouveau-quest">+ Nouveau questionnaire</button><span class="adm-badge">Mode administrateur</span>';
    var h = erreur ? '<p class="form-err">' + K.esc(erreur) + '</p>' : "";
    if (vide && admin()) h += '<p class="res-vide">Rien de publié pour l\'instant. Utilise les boutons ci-dessus.</p>';
    h += '<div class="annonces-grille">' + d.annonces.map(annonceHtml).join("") + d.questionnaires.map(questHtml).join("") + '</div>';
    contenu.innerHTML = h;
    d.annonces.forEach(function (a) {
      var box = contenu.querySelector('[data-annonce="' + a.id + '"]');
      if (box) K.commentaires("annonce:" + a.id, box);
    });
  }

  /* ----- Actions ----- */
  function echec(e) { alert(e.message || "Une erreur est survenue."); }
  zone.addEventListener("click", function (e) {
    var b = e.target.closest("[data-act]");
    if (!b) return;
    var act = b.getAttribute("data-act"), id = b.getAttribute("data-id");
    if (act === "connexion") K.ouvrirConnexion();
    else if (act === "suppr-annonce") { if (confirm("Supprimer cette annonce ?")) K.appel("DELETE", "/api/annonces/" + encodeURIComponent(id)).then(charger, echec); }
    else if (act === "suppr-quest") { if (confirm("Supprimer ce questionnaire et toutes ses réponses ?")) K.appel("DELETE", "/api/questionnaires/" + encodeURIComponent(id)).then(charger, echec); }
    else if (act === "toggle-quest") K.appel("PATCH", "/api/questionnaires/" + encodeURIComponent(id), { ouvert: b.getAttribute("data-ouvert") === "1" }).then(charger, echec);
    else if (act === "nouvelle-annonce") formAnnonce();
    else if (act === "nouveau-quest") formQuestionnaire();
  });

  zone.addEventListener("submit", function (e) {
    var f = e.target.closest("form.qform");
    if (!f) return;
    e.preventDefault();
    var id = f.getAttribute("data-quest"), q = data.questionnaires.filter(function (x) { return x.id === id; })[0];
    var rep = {}, err = f.querySelector(".form-err");
    for (var i = 0; i < q.questions.length; i++) {
      var qu = q.questions[i], els = f.querySelectorAll('[name="q-' + id + '-' + qu.id + '"]');
      if (qu.type === "texte") { rep[qu.id] = els[0].value; continue; }
      var cochees = Array.prototype.filter.call(els, function (x) { return x.checked; }).map(function (x) { return x.value; });
      if (qu.type === "unique") { if (!cochees.length) { err.textContent = "Réponds à : « " + qu.texte + " »"; return; } rep[qu.id] = cochees[0]; }
      else rep[qu.id] = cochees;
    }
    var btn = f.querySelector("[type=submit]");
    btn.disabled = true;
    K.appel("POST", "/api/reponses/" + encodeURIComponent(id), { reponses: rep }).then(charger, function (er) {
      btn.disabled = false; err.textContent = er.message;
    });
  });

  /* ----- Formulaires admin ----- */
  function fenetre(titre, corps, surEnvoi) {
    document.dispatchEvent(new Event("lni:modal"));
    var fond = document.createElement("div");
    fond.className = "modal-fond";
    fond.innerHTML = '<div class="modal modal-large" role="dialog" aria-modal="true"><button class="modal-x" type="button" aria-label="Fermer">' + ICON.close + '</button><h2>' + K.esc(titre) + '</h2><form novalidate>' + corps + '<p class="form-err" role="alert"></p><button class="btn-login" type="submit">Publier</button></form></div>';
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
      Promise.resolve(surEnvoi(form)).then(function () { fermer(); charger(); }, function (er) {
        btn.disabled = false; err.textContent = er && er.message ? er.message : (typeof er === "string" ? er : "Erreur");
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
        return K.appel("POST", "/api/annonces", { titre: f.titre.value, texte: f.texte.value, lien: f.lien.value });
      });
  }
  function formQuestionnaire() {
    var n = 0;
    var form = fenetre("Nouveau questionnaire",
      '<label>Titre<input name="titre" maxlength="120" required></label>' +
      '<label>Description (facultatif)<textarea name="description" rows="2" maxlength="500"></textarea></label>' +
      '<div class="qs"></div><button class="mini" type="button" data-ajout>+ Ajouter une question</button>',
      function (f) {
        var qs = [], blocs = f.querySelectorAll(".qb");
        for (var i = 0; i < blocs.length; i++) {
          var b = blocs[i], type = b.querySelector("select").value;
          qs.push({ texte: b.querySelector(".qt").value, type: type, options: type === "texte" ? [] : b.querySelector(".qo").value.split("\n") });
        }
        return K.appel("POST", "/api/questionnaires", { titre: f.titre.value, description: f.description.value, questions: qs });
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
