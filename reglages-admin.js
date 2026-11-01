/* Panneau « Réglages du site » pour les admins (bouton dans le menu du compte) */
(function () {
  "use strict";
  var C = SITE.actualites || {};
  if (!C.urlApi) return;
  var API = C.urlApi.replace(/\/+$/, "");
  var PAGES = [["accueil", "Accueil"], ["programme", "Programme"], ["series", "Séries"], ["communaute", "Communauté"], ["affiliation", "Affiliation"], ["contact", "Contact"], ["mentions", "Mentions légales"]];
  var estAdmin = false, jetonVerifie = null;

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function session() { try { return JSON.parse(localStorage.getItem("lni_session")); } catch (e) { return null; } }
  function entete() { var s = session(); return s && s.jeton ? { Authorization: (s.fournisseur === "google" ? "Google " : "Discord ") + s.jeton } : null; }

  function verifier() {
    var h = entete();
    if (!h) { estAdmin = false; jetonVerifie = null; return; }
    if (jetonVerifie === h.Authorization) return;
    jetonVerifie = h.Authorization;
    fetch(API + "/api/moi", { headers: h }).then(function (r) { return r.ok ? r.json() : null; }).then(function (d) { estAdmin = !!(d && d.admin); }).catch(function () { estAdmin = false; });
  }
  verifier();
  document.addEventListener("lni:session", verifier);

  document.addEventListener("lni:menu-compte", function (e) {
    if (!estAdmin) return;
    var b = document.createElement("button");
    b.type = "button";
    b.innerHTML = ICON.settings + "Réglages du site";
    b.addEventListener("click", function () { var m = e.detail.menu; if (m) m.remove(); ouvrir(); });
    var ref = e.detail.menu.querySelector(".js-profil");
    e.detail.menu.insertBefore(b, ref);
  });

  function coche(nom, texte, etat) {
    return '<label class="coche"><input type="checkbox" name="' + nom + '"' + (etat ? " checked" : "") + '> ' + esc(texte) + '</label>';
  }

  function ouvrir() {
    document.dispatchEvent(new Event("lni:modal"));
    var m = SITE.maintenance || {}, a = SITE.annonce || {}, cb = SITE.chatbot || {}, pa = SITE.partenaires || {};
    var fond = document.createElement("div");
    fond.className = "modal-fond";
    fond.innerHTML = '<div class="modal modal-large" role="dialog" aria-modal="true" aria-labelledby="rg-titre">' +
      '<button class="modal-x" type="button" aria-label="Fermer">' + ICON.close + '</button>' +
      '<h2 id="rg-titre">Réglages du site</h2><form novalidate>' +
      '<fieldset class="rg-bloc"><legend>Pages en maintenance</legend>' + PAGES.map(function (p) { return coche("m-" + p[0], p[1], m[p[0]]); }).join("") + '</fieldset>' +
      '<fieldset class="rg-bloc"><legend>Bandeau d\'annonce en haut du site</legend>' + coche("a-actif", "Afficher le bandeau", a.actif) +
        '<label>Texte<input name="a-texte" maxlength="200" value="' + esc(a.texte) + '"></label>' +
        '<label>Lien (facultatif)<input name="a-lien" type="url" placeholder="https://..." value="' + esc(a.lien) + '"></label></fieldset>' +
      '<fieldset class="rg-bloc"><legend>Fonctions</legend>' + coche("chatbot", "Assistant de chat (bulle en bas à droite)", cb.actif) + coche("partenaires", "Carrousel des partenaires", pa.afficher !== false) + '</fieldset>' +
      '<p class="form-err" role="alert"></p><button class="btn-login" type="submit">Enregistrer</button></form></div>';
    document.body.appendChild(fond);
    var form = fond.querySelector("form"), err = fond.querySelector(".form-err");
    function fermer() { document.removeEventListener("keydown", touche); fond.remove(); }
    function touche(ev) { if (ev.key === "Escape") fermer(); }
    document.addEventListener("keydown", touche);
    fond.addEventListener("mousedown", function (ev) { if (ev.target === fond) fermer(); });
    fond.querySelector(".modal-x").addEventListener("click", fermer);
    form.addEventListener("submit", function (ev) {
      ev.preventDefault();
      var h = entete();
      if (!h) { err.textContent = "Reconnecte-toi avec Discord ou Google."; return; }
      var maint = {};
      PAGES.forEach(function (p) { maint[p[0]] = form.elements["m-" + p[0]].checked; });
      var corps = { maintenance: maint,
        annonce: { actif: form.elements["a-actif"].checked, texte: form.elements["a-texte"].value, lien: form.elements["a-lien"].value },
        chatbot: { actif: form.elements.chatbot.checked }, partenaires: { afficher: form.elements.partenaires.checked } };
      var btn = form.querySelector(".btn-login"); btn.disabled = true;
      fetch(API + "/api/reglages", { method: "PUT", headers: { Authorization: h.Authorization, "Content-Type": "application/json" }, body: JSON.stringify(corps) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw r.status === 401 ? "Ta connexion a expiré : déconnecte-toi puis reconnecte-toi." : (d.erreur || "Erreur du serveur"); }); })
        .then(function () {
          try { localStorage.setItem("lni_reglages_site", JSON.stringify(corps)); sessionStorage.removeItem("lni_rl"); } catch (e) {}
          location.reload();
        }, function (msg) { btn.disabled = false; err.textContent = typeof msg === "string" ? msg : "Impossible d'enregistrer."; });
    });
  }
})();
