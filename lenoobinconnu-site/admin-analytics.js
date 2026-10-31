(function () {
  "use strict";
  var K = window.LNI_COMMUN;
  var contenu = document.getElementById("adm-analytics-content");
  var message = document.getElementById("adm-analytics-message");
  var periode = document.getElementById("adm-analytics-period");
  var chargement = false;
  var actualisationLive = null;
  var derniereDonnee = null;

  function afficherMessage(texte, erreur) {
    message.textContent = texte || "";
    message.hidden = !texte;
    message.className = "adm-page-msg " + (erreur ? "err" : "ok");
  }

  function liste(items, vide) {
    if (!items || !items.length) return '<p class="adm-analytics-empty">' + K.esc(vide || "Aucune donnée pour cette période.") + "</p>";
    var maximum = Math.max.apply(null, items.map(function (item) { return item.total; }).concat([1]));
    return '<ul class="adm-analytics-list">' + items.slice(0, 10).map(function (item) {
      var part = Math.max(3, Math.round(item.total * 100 / maximum));
      return '<li><div><span>' + K.esc(item.nom) + '</span><strong>' + item.total + '</strong></div>' +
        '<span class="adm-analytics-track"><span style="width:' + part + '%"></span></span></li>';
    }).join("") + "</ul>";
  }

  function graphique(jours) {
    var maximum = Math.max.apply(null, jours.map(function (jour) { return jour.total; }).concat([1]));
    return jours.map(function (jour) {
      var hauteur = jour.total ? Math.max(4, Math.round(jour.total * 100 / maximum)) : 0;
      var date = new Date(jour.date + "T00:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
      return '<div class="adm-analytics-day" title="' + K.esc(date + " : " + jour.total + " vue(s)") + '">' +
        '<span class="adm-analytics-bar" style="height:' + hauteur + '%"></span><small>' + K.esc(date) + '</small></div>';
    }).join("");
  }

  function nomPays(code) {
    try { return new Intl.DisplayNames(["fr"], { type: "region" }).of(code); }
    catch (e) { return code; }
  }

  function afficher(d) {
    derniereDonnee = d;
    document.getElementById("adm-analytics-metrics").innerHTML =
      '<article><strong>' + d.visites + '</strong><span>Vues sur la période</span></article>' +
      '<article><strong id="adm-analytics-live">' + (d.sessionsEnLigneLimitees ? d.visiteursEnLigne + "+" : d.visiteursEnLigne) + '</strong><span>Sessions actives estimées</span></article>' +
      '<article><strong>' + Math.floor(d.tempsMoyenSecondes / 60) + ' min ' + (d.tempsMoyenSecondes % 60) + ' s</strong><span>Durée moyenne visible</span></article>';
    document.getElementById("adm-analytics-days").innerHTML = graphique(d.statistiquesJournalieres || []);
    document.getElementById("adm-analytics-pages").innerHTML = liste(d.pages, "Aucune vue enregistrée.");
    document.getElementById("adm-analytics-sources").innerHTML = liste(d.sources);
    document.getElementById("adm-analytics-devices").innerHTML = liste(d.appareils);
    document.getElementById("adm-analytics-countries").innerHTML = liste((d.pays || []).map(function (pays) {
      return { nom: pays.nom === "Autre/Inconnu" ? pays.nom : nomPays(pays.nom), total: pays.total };
    }));
    document.getElementById("adm-analytics-systems").innerHTML = liste(d.systemes);
    document.getElementById("adm-analytics-browsers").innerHTML = liste(d.navigateurs);
    afficherMessage(d.donneesLimitees
      ? "Données partielles : seules 500 vues de la période sont analysées."
      : "Statistiques mises à jour · période de " + d.jours + " jours.", false);
  }

  function charger() {
    if (chargement) return;
    chargement = true;
    document.getElementById("adm-analytics-refresh").disabled = true;
    afficherMessage("Chargement des statistiques…", false);
    K.appel("GET", "/api/admin/analytics?jours=" + encodeURIComponent(periode.value)).then(afficher, function (erreur) {
      afficherMessage("Impossible de charger les statistiques : " + erreur.message, true);
    }).then(function () {
      chargement = false;
      document.getElementById("adm-analytics-refresh").disabled = false;
    });
  }

  function actualiserLive() {
    K.appel("GET", "/api/admin/analytics-live").then(function (d) {
      var compteur = document.getElementById("adm-analytics-live");
      if (compteur) compteur.textContent = d.limiteAtteinte ? d.visiteursEnLigne + "+" : d.visiteursEnLigne;
      if (message.classList.contains("err") && derniereDonnee) {
        afficherMessage(derniereDonnee.donneesLimitees
          ? "Données partielles : seules 500 vues de la période sont analysées."
          : "Statistiques mises à jour · période de " + derniereDonnee.jours + " jours.", false);
      }
    }, function (erreur) {
      afficherMessage("Impossible d’actualiser les sessions actives : " + erreur.message, true);
    });
  }

  document.getElementById("adm-page-logout").addEventListener("click", function () {
    if (window.LNI_AUTH) window.LNI_AUTH.deconnecter();
    else {
      try { localStorage.removeItem("lni_session"); } catch (e) {}
    }
    location.href = "index.html";
  });
  document.getElementById("adm-analytics-refresh").addEventListener("click", charger);
  periode.addEventListener("change", charger);

  if (!K.connecte()) {
    afficherMessage("Connecte-toi avec un compte administrateur pour consulter cette page.", true);
    var connexion = document.createElement("button");
    connexion.type = "button";
    connexion.className = "mini plein";
    connexion.textContent = "Se connecter";
    connexion.addEventListener("click", K.ouvrirConnexion);
    message.parentNode.insertBefore(connexion, message.nextSibling);
    return;
  }
  K.appel("GET", "/api/moi").then(function (moi) {
    if (!moi.admin) throw new Error("Cette page est réservée aux administrateurs.");
    var session = K.session() || {};
    document.getElementById("adm-page-user").innerHTML = (moi.avatar || session.avatar
      ? '<img src="' + K.esc(moi.avatar || session.avatar) + '" alt="" referrerpolicy="no-referrer">'
      : '<span class="ini">' + K.esc((moi.nom || "?").charAt(0).toUpperCase()) + "</span>") +
      '<div style="min-width:0"><strong>' + K.esc(moi.nom || "Administrateur") + '</strong><small>Administrateur</small></div>';
    charger();
    actualisationLive = window.setInterval(actualiserLive, 30000);
  }).catch(function (erreur) {
    contenu.innerHTML = '<section class="adm-page-card adm-page-login"><h1>Accès refusé</h1><p>' + K.esc(erreur.message) + '</p><a class="btn-login" href="admin.html">Retour au tableau de bord</a></section>';
  });
  window.addEventListener("pagehide", function () {
    if (actualisationLive) window.clearInterval(actualisationLive);
  });
})();
