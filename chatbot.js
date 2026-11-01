/* Chatbot du site : bulle de chat reliée à ton proxy d'API (voir worker.js). Ne pas modifier. */
(function () {
  "use strict";
  var C = (window.SITE && SITE.chatbot) || {};
  if (!C.actif) return;

  var CLE = "lni_chat";
  var messages = [];   // historique envoyé à l'API : { role: "user" | "assistant", content: "..." }
  var envoyes = 0;     // nombre de messages envoyés par le visiteur
  var occupe = false;

  try {
    var s = JSON.parse(sessionStorage.getItem(CLE) || "null");
    if (s && Array.isArray(s.messages)) { messages = s.messages; envoyes = s.envoyes || 0; }
  } catch (e) {}
  function sauver() { try { sessionStorage.setItem(CLE, JSON.stringify({ messages: messages, envoyes: envoyes })); } catch (e) {} }

  function el(tag, cls, txt) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (txt != null) n.textContent = txt;
    return n;
  }

  /* ---------- Construction de l'interface ---------- */
  var root = el("div", "chat");
  var bouton = el("button", "chat-fab");
  bouton.type = "button";
  bouton.setAttribute("aria-label", "Ouvrir le chat");
  bouton.setAttribute("aria-expanded", "false");
  bouton.setAttribute("aria-controls", "chat-panel");
  bouton.innerHTML = ICON.chat;

  var panel = el("section", "chat-panel");
  panel.id = "chat-panel";
  panel.setAttribute("aria-label", C.nom || "Chat");
  panel.hidden = true;

  var tete = el("div", "chat-head");
  tete.appendChild(el("strong", null, C.nom || "Assistant"));
  var fermer = el("button", "chat-x");
  fermer.type = "button";
  fermer.setAttribute("aria-label", "Fermer le chat");
  fermer.innerHTML = ICON.close;
  tete.appendChild(fermer);

  var fil = el("div", "chat-log");
  fil.setAttribute("role", "log");
  fil.setAttribute("aria-live", "polite");

  var sugg = el("div", "chat-sugg");

  var form = el("form", "chat-form");
  var champ = el("input", "chat-input");
  champ.type = "text";
  champ.maxLength = 500;
  champ.placeholder = "Écris ton message…";
  champ.autocomplete = "off";
  champ.setAttribute("aria-label", "Ton message");
  var envoi = el("button", "chat-send");
  envoi.type = "submit";
  envoi.setAttribute("aria-label", "Envoyer");
  envoi.innerHTML = ICON.send;
  form.appendChild(champ);
  form.appendChild(envoi);

  panel.appendChild(tete);
  panel.appendChild(fil);
  panel.appendChild(sugg);
  panel.appendChild(form);
  root.appendChild(panel);
  root.appendChild(bouton);
  document.body.appendChild(root);

  /* ---------- Affichage ---------- */
  function bulle(role, texte, extra) {
    var b = el("div", "chat-msg " + (role === "user" ? "moi" : "bot") + (extra ? " " + extra : ""), texte);
    fil.appendChild(b);
    fil.scrollTop = fil.scrollHeight;
    return b;
  }

  function afficherSuggestions() {
    sugg.innerHTML = "";
    if (messages.length || !(C.suggestions && C.suggestions.length)) return;
    C.suggestions.forEach(function (t) {
      var b = el("button", "chat-chip", t);
      b.type = "button";
      b.addEventListener("click", function () { envoyer(t); });
      sugg.appendChild(b);
    });
  }

  function restaurer() {
    bulle("assistant", C.accueil || "Salut !");
    messages.forEach(function (m) { bulle(m.role, m.content); });
    afficherSuggestions();
  }

  function ouvrir(o) {
    panel.hidden = !o;
    bouton.setAttribute("aria-expanded", o ? "true" : "false");
    bouton.classList.toggle("ouvert", o);
    if (o) { champ.focus(); fil.scrollTop = fil.scrollHeight; }
  }
  bouton.addEventListener("click", function () { ouvrir(panel.hidden); });
  fermer.addEventListener("click", function () { ouvrir(false); bouton.focus(); });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !panel.hidden) { ouvrir(false); bouton.focus(); }
  });

  /* ---------- Envoi à l'API ---------- */
  function envoyer(texte) {
    texte = String(texte || "").trim();
    if (!texte || occupe) return;

    if (!C.urlApi) {
      bulle("user", texte);
      bulle("assistant", "Le chat n'est pas encore disponible. Passe par le Discord en attendant !", "erreur");
      champ.value = "";
      return;
    }
    var max = Number(C.maxMessages) || 30;
    if (envoyes >= max) {
      bulle("assistant", "Tu as atteint la limite de messages pour cette session. Rejoins le Discord pour continuer la discussion !", "erreur");
      return;
    }

    occupe = true;
    envoyes++;
    champ.value = "";
    envoi.disabled = true;
    sugg.innerHTML = "";
    bulle("user", texte);
    messages.push({ role: "user", content: texte });
    var attente = bulle("assistant", "…", "attente");

    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var delai = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);

    // On n'envoie que les 12 derniers messages : suffisant et peu coûteux.
    var corps = JSON.stringify({ messages: messages.slice(-12) });

    fetch(C.urlApi, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: corps,
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) { return { ok: r.ok, status: r.status, data: d }; });
    }).then(function (res) {
      if (!res.ok || !res.data || !res.data.reply) {
        throw new Error(res.status === 429 ? "limite" : "erreur");
      }
      attente.className = "chat-msg bot";
      attente.textContent = res.data.reply;
      messages.push({ role: "assistant", content: res.data.reply });
      sauver();
    }).catch(function (err) {
      // On retire le message utilisateur resté sans réponse pour garder un historique valide.
      messages.pop();
      envoyes = Math.max(0, envoyes - 1);
      attente.className = "chat-msg bot erreur";
      attente.textContent = err && err.message === "limite"
        ? "Trop de messages d'un coup. Patiente une minute puis réessaie."
        : "Je n'arrive pas à répondre pour le moment. Réessaie dans un instant ou passe par le Discord.";
    }).then(function () {
      clearTimeout(delai);
      occupe = false;
      envoi.disabled = false;
      fil.scrollTop = fil.scrollHeight;
      champ.focus();
    });
  }

  form.addEventListener("submit", function (e) { e.preventDefault(); envoyer(champ.value); });

  restaurer();
})();
