/* Page Profil : infos, abonnés, abonnement et publications d'une personne */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var id = new URLSearchParams(location.search).get("id") || (K.session() && K.session().uid) || null;
  var titre = document.getElementById("pr-titre"), entete = document.getElementById("pr-entete"), posts = document.getElementById("pr-posts");
  var dernier = (K.session() && K.session().jeton) || null;

  if (!id) {
    titre.textContent = "Profil introuvable";
    entete.innerHTML = '<p class="com-note">Ouvre un profil depuis le fil, ou connecte-toi pour voir le tien.</p><a class="mini" href="fil.html">Aller au fil</a>';
    return;
  }

  function charger() {
    return Promise.all([
      K.appel("GET", "/api/profil/" + encodeURIComponent(id)),
      K.appel("GET", "/api/utilisateur/" + encodeURIComponent(id) + "/posts")
    ]).then(function (r) { dessiner(r[0], r[1]); },
      function (e) { titre.textContent = "Profil introuvable"; entete.innerHTML = '<p class="form-err">' + K.esc(e.message) + '</p>'; });
  }

  function dessiner(p, publications) {
    document.title = p.pseudo + " - LeNoobInconnu";
    titre.textContent = p.pseudo;
    var nomsRoles = { utilisateur: "Utilisateur", moderateur: "Modérateur", createur: "Créateur", vip: "VIP", premium: "Premium", personnalise: "Personnalisé" };
    var badges = (p.badges || []).map(function (badge) {
      return '<span class="profil-badge">' + K.esc(badge) + '</span>';
    }).join("");
    var roles = (p.roles || []).filter(function (role) { return nomsRoles[role] && role !== "utilisateur"; }).map(function (role) {
      return '<span class="profil-badge profil-role">' + K.esc(nomsRoles[role]) + '</span>';
    }).join("");
    if (p.verifie) badges = '<span class="profil-badge profil-verifie" title="Compte vérifié">✓ Compte vérifié</span>' + badges;
    var action;
    if (p.estMoi) action = '<a class="mini plein" href="parametres.html#compte">Modifier mon profil</a>';
    else if (p.connecte) action = '<button class="mini plein" type="button" data-suivre>' + (p.jeSuis ? "Ne plus suivre" : "Suivre") + '</button>';
    else action = '<button class="mini plein" type="button" data-login>Connecte-toi pour suivre</button>';
    entete.innerHTML =
      '<div class="pe-haut" style="--profil-couleur:' + K.esc(p.couleur || "#e84b3c") + '">' + K.avatar(p.avatar, "pe-photo") +
        '<div class="pe-infos"><h2>' + K.esc(p.pseudo) + '</h2>' + (p.bio ? '<p class="pe-bio">' + K.esc(p.bio) + '</p>' : "") +
        (badges || roles ? '<div class="profil-badges">' + badges + roles + '</div>' : "") + '</div>' + action + '</div>' +
      '<dl class="pe-stats">' +
        '<div><dt>Abonnés</dt><dd>' + p.abonnes + '</dd></div>' +
        '<div><dt>Abonnements</dt><dd>' + p.abonnements + '</dd></div>' +
        '<div><dt>Publications</dt><dd>' + p.publications + '</dd></div>' +
      '</dl>';
    K.publier(posts, publications, charger);
  }

  entete.addEventListener("click", function (e) {
    if (e.target.closest("[data-login]")) return K.ouvrirConnexion();
    if (e.target.closest("[data-suivre]")) {
      K.appel("POST", "/api/abonnement/" + encodeURIComponent(id)).then(charger, function (er) { K.alerter(er); });
    }
  });

  document.addEventListener("lni:session", function () {
    var j = (K.session() && K.session().jeton) || null;
    if (j !== dernier) { dernier = j; charger(); }
  });
  charger();
})();
