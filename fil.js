/* Page Fil : publications, composition, likes et commentaires */
(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var compo = document.getElementById("compo"), liste = document.getElementById("fil-liste");
  var dernier = (K.session() && K.session().jeton) || null;

  function charger() {
    return K.appel("GET", "/api/fil").then(function (posts) { K.publier(liste, posts, charger); },
      function (e) { liste.innerHTML = '<p class="form-err">' + K.esc(e.message) + '</p>'; });
  }
  function rendreCompo() { K.composeur(compo, charger); }

  document.addEventListener("lni:session", function () {
    var j = (K.session() && K.session().jeton) || null;
    if (j !== dernier) { dernier = j; rendreCompo(); charger(); }
  });
  rendreCompo();
  charger();
})();
