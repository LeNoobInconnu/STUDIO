/* Serveur de LeNoobInconnu (Cloudflare Workers + KV) :
   annonces, questionnaires (résultats toujours visibles), fil de posts, commentaires, likes,
   profils, abonnements, liaison Discord + Google, réglages du site (dont le logo).
   Variables : GOOGLE_CLIENT_ID, DISCORD_CLIENT_ID, ORIGINES, ADMINS.  Liaison KV : DATA */

class Erreur extends Error { constructor(m, s) { super(m); this.status = s; } }

const txt = (s, n) => String(s == null ? "" : s).trim().slice(0, n);
const liste = (s) => String(s || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const nouvelId = () => crypto.randomUUID().slice(0, 8);
const IMG_RE = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const PAGES = ["accueil", "programme", "series", "communaute", "fil", "affiliation", "contact", "mentions", "profil", "parametres"];
const ID_OK = /^[A-Za-z0-9:_-]{1,80}$/;
const TID_OK = /^(post|annonce):[A-Za-z0-9-]{1,20}$/;
const ROUTES = {
  accueil: "index.html", programme: "programme.html", series: "series.html", communaute: "communaute.html",
  fil: "fil.html", affiliation: "Affiliation.html", contact: "contact.html", mentions: "mentions.html",
  parametres: "parametres.html",
};

export default {
  async fetch(req, env) {
    const cors = entetesCors(req, env);
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      return reponse(await route(req, env), 200, cors);
    } catch (e) {
      const status = e instanceof Erreur ? e.status : 500;
      if (status === 500) console.log(e && e.stack ? e.stack : e);
      return reponse({ erreur: e instanceof Erreur ? e.message : "Erreur du serveur" }, status, cors);
    }
  },
};

function entetesCors(req, env) {
  const ok = liste(env.ORIGINES);
  const o = (req.headers.get("Origin") || "").toLowerCase();
  const autorise = ok.includes(o) ? req.headers.get("Origin") : (ok[0] || "");
  return {
    "Access-Control-Allow-Origin": autorise,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Vary": "Origin",
  };
}
function reponse(data, status, cors) {
  return new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

/* ---------- Identité : le serveur vérifie le jeton auprès de Google / Discord ---------- */
async function verifier(type, jeton, env) {
  if (!jeton) return null;
  if (type === "Google") {
    const r = await fetch("https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(jeton));
    if (!r.ok) return null;
    const d = await r.json();
    if (d.aud !== env.GOOGLE_CLIENT_ID || d.email_verified === "false") return null;
    return {
      key: "google:" + d.sub,
      fournisseur: "google",
      nom: d.name || d.given_name || "Joueur",
      email: d.email || "",
      avatar: d.picture || "",
      verifie: d.email_verified === "true",
    };
  }
  if (type === "Discord") {
    const r = await fetch("https://discord.com/api/oauth2/@me", { headers: { Authorization: "Bearer " + jeton } });
    if (!r.ok) return null;
    const d = await r.json();
    if (!d.user || !d.application || d.application.id !== env.DISCORD_CLIENT_ID) return null;
    const profil = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: "Bearer " + jeton } });
    if (!profil.ok) return null;
    const u = await profil.json();
    if (!u || !u.id || !d.user || u.id !== d.user.id) return null;
    return { key: "discord:" + u.id, fournisseur: "discord", nom: u.global_name || u.username || "Joueur",
      email: u.email || d.user.email || "", verifie: !!u.verified,
      avatar: u.avatar ? "https://cdn.discordapp.com/avatars/" + u.id + "/" + u.avatar + ".png?size=64" : "" };
  }
  return null;
}
function enTete(req) {
  const [type, jeton] = (req.headers.get("Authorization") || "").split(" ");
  return { type, jeton };
}

// Contexte de la personne connectée : son compte (uid) peut regrouper plusieurs identités
async function contexte(req, env) {
  const { type, jeton } = enTete(req);
  const id = await verifier(type, jeton, env);
  if (!id) return null;
  const uid = (await env.DATA.get("ident:" + id.key)) || id.key;
  const idents = (await lire(env, "idents:" + uid)) || [];
  const ids = [...new Set([uid, ...idents])];
  const pr = (await lire(env, "profil:" + uid)) || {};
  const admins = liste(env.ADMINS);
  const gestion = (await lire(env, "gestion:" + uid, {})) || {};
  if (id.fournisseur) {
    const comptes = (await lire(env, "comptes:" + uid, {})) || {};
    comptes[id.fournisseur] = {
      fournisseur: id.fournisseur,
      identifiant: id.key,
      nom: id.nom,
      email: txt(id.email, 254),
      verifie: !!id.verifie,
      avatar: id.avatar || "",
    };
    await ecrire(env, "comptes:" + uid, comptes);
  }
  const maintenant = Date.now();
  if (!gestion.derniereActivite || maintenant - gestion.derniereActivite > 60000) {
    gestion.derniereActivite = maintenant;
    await ecrire(env, "gestion:" + uid, gestion);
  }
  return {
    uid,
    ids,
    principal: uid.split(":")[0],
    nom: pr.pseudo || id.nom,
    avatar: pr.avatar !== undefined ? pr.avatar : id.avatar,
    admin: ids.some((k) => admins.includes(k.toLowerCase())),
    gestion,
    role: gestion.role || "utilisateur",
    permissions: gestion.permissions || {},
    suspenduJusqua: Number(gestion.suspenduJusqua) || 0,
    banni: !!gestion.banni,
    fournisseurs: [...new Set(ids.map((k) => k.split(":")[0]))],
    profilExiste: !!pr.pseudo,
    fournisseurReq: type === "Google" ? "google" : "discord",
  };
}
async function exiger(req, env) {
  const c = await contexte(req, env);
  if (!c) throw new Erreur("Connexion requise ou expirée.", 401);
  if (!c.admin && (c.banni || c.suspenduJusqua > Date.now())) {
    throw new Erreur(c.banni ? "Ce compte est banni." : "Ce compte est temporairement suspendu.", 403);
  }
  return c;
}
async function exigerAdmin(req, env) {
  const c = await exiger(req, env);
  if (!c.admin) throw new Erreur("Réservé aux administrateurs.", 403);
  return c;
}
async function assurerProfil(env, c) {
  if (c.profilExiste) return;
  await ecrire(env, "profil:" + c.uid, { pseudo: (c.nom || "Joueur").slice(0, 24), avatar: c.avatar || "", bio: "", createdAt: Date.now() });
  c.profilExiste = true;
}

/* ---------- Stockage (petites aides) ---------- */
const lire = async (env, k, def = []) => (await env.DATA.get(k, "json")) ?? def;
const ecrire = (env, k, v) => env.DATA.put(k, JSON.stringify(v));

async function infos(env, uids) {
  const out = {};
  for (const u of [...new Set(uids)]) {
    const p = (await lire(env, "profil:" + u, null)) || {};
    out[u] = { id: u, pseudo: p.pseudo || "Joueur", avatar: p.avatar || "" };
  }
  return out;
}

// Une publication, prête à afficher (auteur, likes, commentaires, droits)
async function publications(env, ids, c) {
  const posts = [];
  for (const id of ids) { const p = await lire(env, "post:" + id, null); if (p) posts.push(p); }
  const auteurs = await infos(env, posts.map((p) => p.uid));
  const out = [];
  for (const p of posts) {
    const coms = await lire(env, "com:post:" + p.id);
    out.push({
      id: p.id, texte: p.texte, image: p.image || "", date: p.date,
      auteur: auteurs[p.uid],
      aime: p.aime.length,
      jAime: !!c && p.aime.includes(c.uid),
      commentaires: coms.length,
      peutSupprimer: !!c && (c.uid === p.uid || c.admin || !!c.permissions.gererPublications),
    });
  }
  return out;
}

/* ---------- Questionnaires ---------- */
async function reponsesDe(env, qid) {
  const out = [];
  let cursor;
  do {
    const l = await env.DATA.list({ prefix: "rep:" + qid + ":", cursor });
    for (const k of l.keys) { const v = await env.DATA.get(k.name, "json"); if (v) out.push(v); }
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
  return out;
}
async function supprimerReponses(env, qid) {
  let cursor;
  do {
    const l = await env.DATA.list({ prefix: "rep:" + qid + ":", cursor });
    for (const k of l.keys) await env.DATA.delete(k.name);
    cursor = l.list_complete ? null : l.cursor;
  } while (cursor);
}
async function resultats(env, q) {
  const reps = await reponsesDe(env, q.id);
  return {
    total: reps.length,
    questions: q.questions.map((qu) => {
      const compte = {};
      qu.options.forEach((o) => (compte[o] = 0));
      const textes = [];
      reps.forEach((r) => {
        const v = r.rep[qu.id];
        if (qu.type === "texte") { if (v) textes.push({ nom: r.nom, texte: v }); }
        else if (qu.type === "unique") { if (v in compte) compte[v]++; }
        else (v || []).forEach((o) => { if (o in compte) compte[o]++; });
      });
      return { id: qu.id, texte: qu.texte, type: qu.type, options: qu.options, compte, textes };
    }),
  };
}
function nettoyerQuestionnaire(b) {
  const titre = txt(b.titre, 120);
  if (!titre) throw new Erreur("Le titre est obligatoire.", 400);
  const questions = (Array.isArray(b.questions) ? b.questions : []).slice(0, 10).map((q, i) => {
    const type = ["unique", "multiple", "texte"].includes(q && q.type) ? q.type : null;
    const texte = txt(q && q.texte, 200);
    if (!type || !texte) throw new Erreur("Chaque question a besoin d'un texte et d'un type.", 400);
    let options = [];
    if (type !== "texte") {
      options = (Array.isArray(q.options) ? q.options : []).map((o) => txt(o, 100)).filter(Boolean).slice(0, 10);
      if (options.length < 2) throw new Erreur("Il faut au moins 2 options par question à choix.", 400);
    }
    return { id: "q" + (i + 1), type, texte, options };
  });
  if (!questions.length) throw new Erreur("Ajoute au moins une question.", 400);
  return { id: nouvelId(), titre, description: txt(b.description, 500), ouvert: true, date: Date.now(), questions };
}

/* ---------- Commentaires (sur une publication ou une annonce) ---------- */
async function tidValide(env, tid) {
  if (!TID_OK.test(tid)) throw new Erreur("Élément introuvable.", 404);
  const [type, id] = tid.split(":");
  if (type === "post" && !(await env.DATA.get("post:" + id))) throw new Erreur("Publication introuvable.", 404);
  if (type === "annonce") {
    const k = await lire(env, "contenu", { annonces: [] });
    if (!k.annonces.some((a) => a.id === id)) throw new Erreur("Annonce introuvable.", 404);
  }
}

/* ---------- Routes ---------- */
async function route(req, env) {
  const p = new URL(req.url).pathname.replace(/\/+$/, "").split("/").filter(Boolean).map((s) => decodeURIComponent(s));
  if (p[0] !== "api") throw new Erreur("Introuvable.", 404);
  const m = req.method, r = p[1], a = p[2], b2 = p[3], c2 = p[4];
  const corps = async () => { try { return await req.json(); } catch (e) { throw new Erreur("Requête invalide.", 400); } };
  for (const x of [a, b2, c2]) if (x !== undefined && !ID_OK.test(x) && !TID_OK.test(x)) throw new Erreur("Requête invalide.", 400);

  /* Contenu public */
  if (m === "GET" && r === "contenu") {
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    const quest = [];
    for (const q of k.questionnaires) quest.push({ ...q, resultats: await resultats(env, q) });
    return { annonces: k.annonces, questionnaires: quest };
  }
  if (m === "GET" && r === "reglages") return lire(env, "reglages", {});

  /* Session et compte */
  if (m === "POST" && r === "session") {
    const c = await exiger(req, env);
    await assurerProfil(env, c);
    const historique = (await lire(env, "historique:" + c.uid)) || [];
    historique.unshift({ date: Date.now(), fournisseur: c.fournisseurReq });
    await ecrire(env, "historique:" + c.uid, historique.slice(0, 30));
    return { ok: true };
  }
  if (m === "GET" && r === "admin" && a === "utilisateurs") {
    await exigerAdmin(req, env);
    const url = new URL(req.url);
    const curseur = url.searchParams.get("cursor") || undefined;
    const page = await env.DATA.list({ prefix: "profil:", limit: 50, cursor: curseur });
    const admins = liste(env.ADMINS);
    const utilisateurs = [];
    for (const cle of page.keys) {
      const id = cle.name.slice("profil:".length);
      const profil = await lire(env, cle.name, {});
      const identites = [...new Set([id, ...(await lire(env, "idents:" + id))])];
      const comptes = (await lire(env, "comptes:" + id, {})) || {};
      const gestion = (await lire(env, "gestion:" + id, {})) || {};
      utilisateurs.push({
        id,
        pseudo: profil.pseudo || "Joueur",
        avatar: profil.avatar || "",
        bio: profil.bio || "",
        inscritLe: profil.createdAt || null,
        fournisseurs: [...new Set(identites.map((x) => x.split(":")[0]))],
        comptes: identites.map((identite) => {
          const fournisseur = identite.split(":")[0];
          const info = comptes[fournisseur] || {};
          return {
            fournisseur,
            identifiant: identite,
            nom: info.nom || "",
            email: info.email || "",
            verifie: !!info.verifie,
          };
        }),
        role: gestion.role || "utilisateur",
        permissions: gestion.permissions || {},
        banni: !!gestion.banni,
        suspenduJusqua: Number(gestion.suspenduJusqua) || 0,
        derniereActivite: Number(gestion.derniereActivite) || null,
        historique: (await lire(env, "historique:" + id)) || [],
        admin: identites.some((x) => admins.includes(x.toLowerCase())),
        abonnements: (await lire(env, "suit:" + id)).length,
        abonnes: (await lire(env, "abonnes:" + id)).length,
        publications: (await lire(env, "posts:" + id)).length,
      });
    }
    return { utilisateurs, curseur: page.list_complete ? null : page.cursor };
  }
  if (m === "PATCH" && r === "admin" && a === "utilisateurs" && b2) {
    await exigerAdmin(req, env);
    const uid = b2;
    if (!(await env.DATA.get("profil:" + uid))) throw new Erreur("Utilisateur introuvable.", 404);
    const admins = liste(env.ADMINS);
    const identites = [...new Set([uid, ...(await lire(env, "idents:" + uid))])];
    if (identites.some((identite) => admins.includes(identite.toLowerCase()))) {
      throw new Erreur("La gestion d’un compte administrateur doit être faite dans Cloudflare.", 403);
    }
    const b = await corps();
    const gestion = (await lire(env, "gestion:" + uid, {})) || {};
    if (b.role !== undefined) {
      if (!["utilisateur", "moderateur", "personnalise"].includes(b.role)) throw new Erreur("Rôle invalide.", 400);
      gestion.role = b.role;
      if (b.role === "moderateur") gestion.permissions = { gererPublications: true, gererCommentaires: true };
      if (b.role === "utilisateur") gestion.permissions = {};
    }
    if (b.permissions !== undefined) {
      if (!b.permissions || typeof b.permissions !== "object" || Array.isArray(b.permissions)) throw new Erreur("Permissions invalides.", 400);
      gestion.permissions = {
        gererPublications: !!b.permissions.gererPublications,
        gererCommentaires: !!b.permissions.gererCommentaires,
      };
    }
    if (typeof b.banni === "boolean") {
      gestion.banni = b.banni;
      if (b.banni) gestion.suspenduJusqua = 0;
    }
    if (b.suspenduJusqua !== undefined) {
      const jusqua = Number(b.suspenduJusqua);
      if (!Number.isFinite(jusqua) || (jusqua !== 0 && (jusqua <= Date.now() || jusqua > Date.now() + 365 * 24 * 60 * 60 * 1000))) {
        throw new Erreur("Durée de suspension invalide.", 400);
      }
      gestion.suspenduJusqua = jusqua;
      if (jusqua) gestion.banni = false;
    }
    await ecrire(env, "gestion:" + uid, gestion);
    return { ok: true };
  }
  if (m === "GET" && r === "moi") {
    const c = await exiger(req, env);
    await assurerProfil(env, c);
    const k = await lire(env, "contenu", { questionnaires: [] });
    const repondus = [];
    for (const q of k.questionnaires) if (await env.DATA.get("rep:" + q.id + ":" + c.uid)) repondus.push(q.id);
    const pr = await lire(env, "profil:" + c.uid, {});
    return { id: c.uid, nom: c.nom, avatar: c.avatar, admin: c.admin, principal: c.principal, fournisseurs: c.fournisseurs, repondus, bio: pr.bio || "" };
  }
  if (r === "profil" && !a) {
    if (m === "GET") {
      const c = await exiger(req, env);
      const pr = await lire(env, "profil:" + c.uid, {});
      return { pseudo: c.nom, avatar: c.avatar, bio: pr.bio || "" };
    }
    if (m === "PUT") {
      const c = await exiger(req, env);
      const b = await corps();
      const pseudo = txt(b.pseudo, 24);
      if (pseudo.length < 3) throw new Erreur("Le pseudo doit faire au moins 3 caractères.", 400);
      const avatar = String(b.avatar || "");
      if (avatar && (!IMG_RE.test(avatar) || avatar.length > 60000)) throw new Erreur("Photo invalide ou trop lourde.", 400);
      const precedent = await lire(env, "profil:" + c.uid, {});
      await ecrire(env, "profil:" + c.uid, { pseudo, avatar, bio: txt(b.bio, 160), ...(precedent.createdAt ? { createdAt: precedent.createdAt } : {}) });
      return { ok: true };
    }
  }
  if (m === "GET" && r === "profil" && a) {
    const c = await contexte(req, env);
    const pr = await lire(env, "profil:" + a, null);
    if (!pr) throw new Erreur("Profil introuvable.", 404);
    const abonnes = await lire(env, "abonnes:" + a);
    return {
      id: a, pseudo: pr.pseudo || "Joueur", avatar: pr.avatar || "", bio: pr.bio || "",
      abonnes: abonnes.length, abonnements: (await lire(env, "suit:" + a)).length,
      publications: (await lire(env, "posts:" + a)).length,
      estMoi: !!c && c.uid === a,
      jeSuis: !!c && (await lire(env, "suit:" + c.uid)).includes(a),
      connecte: !!c,
    };
  }
  if (m === "POST" && r === "abonnement" && a) {
    const c = await exiger(req, env);
    if (a === c.uid) throw new Erreur("Tu ne peux pas te suivre toi-même.", 400);
    if (!(await env.DATA.get("profil:" + a))) throw new Erreur("Profil introuvable.", 404);
    const suit = await lire(env, "suit:" + c.uid), abonnes = await lire(env, "abonnes:" + a);
    let jeSuis;
    if (suit.includes(a)) {
      jeSuis = false;
      await ecrire(env, "suit:" + c.uid, suit.filter((x) => x !== a));
      await ecrire(env, "abonnes:" + a, abonnes.filter((x) => x !== c.uid));
      return { suit: false, abonnes: abonnes.length - (abonnes.includes(c.uid) ? 1 : 0) };
    }
    jeSuis = true;
    suit.push(a);
    if (!abonnes.includes(c.uid)) abonnes.push(c.uid);
    await ecrire(env, "suit:" + c.uid, suit);
    await ecrire(env, "abonnes:" + a, abonnes);
    return { suit: jeSuis, abonnes: abonnes.length };
  }
  if (m === "GET" && r === "utilisateur" && a === undefined) throw new Erreur("Introuvable.", 404);
  if (m === "GET" && r === "utilisateur" && a && b2 === "posts") {
    const c = await contexte(req, env);
    const ids = (await lire(env, "posts:" + a)).slice(0, 100);
    return publications(env, ids, c);
  }

  /* Liaison des comptes Discord et Google */
  if (m === "POST" && r === "lier") {
    const c = await exiger(req, env);
    const b = await corps();
    const f = b.autre || {};
    const type = f.fournisseur === "google" ? "Google" : f.fournisseur === "discord" ? "Discord" : "";
    const info = await verifier(type, String(f.jeton || ""), env);
    if (!info) throw new Erreur("Impossible de vérifier ce compte. Reconnecte-toi avec ce fournisseur, puis réessaie.", 400);
    if (c.ids.includes(info.key)) return { ok: true, deja: true };
    if (await env.DATA.get("ident:" + info.key)) throw new Erreur("Ce compte est déjà lié à un autre profil.", 409);
    if (await env.DATA.get("profil:" + info.key)) {
      // Un profil vide (aucune publication ni abonnement) est simplement remplacé ; sinon on refuse
      const occupe = (await lire(env, "posts:" + info.key)).length || (await lire(env, "suit:" + info.key)).length || (await lire(env, "abonnes:" + info.key)).length;
      if (occupe) throw new Erreur("Ce compte a déjà son propre profil avec des publications : il ne peut pas être lié automatiquement.", 409);
      await env.DATA.delete("profil:" + info.key);
    }
    await env.DATA.put("ident:" + info.key, c.uid);
    const idents = await lire(env, "idents:" + c.uid);
    idents.push(info.key);
    await ecrire(env, "idents:" + c.uid, idents);
    if (info.fournisseur) {
      const comptes = (await lire(env, "comptes:" + c.uid, {})) || {};
      comptes[info.fournisseur] = {
        fournisseur: info.fournisseur,
        identifiant: info.key,
        nom: info.nom,
        email: txt(info.email, 254),
        verifie: !!info.verifie,
        avatar: info.avatar || "",
      };
      await ecrire(env, "comptes:" + c.uid, comptes);
    }
    return { ok: true };
  }
  if (m === "POST" && r === "delier") {
    const c = await exiger(req, env);
    const b = await corps();
    const f = String(b.fournisseur || "");
    if (!["google", "discord"].includes(f)) throw new Erreur("Fournisseur inconnu.", 400);
    if (c.uid.startsWith(f + ":")) throw new Erreur("C'est ton identifiant principal : il ne peut pas être délié.", 400);
    if (c.fournisseurReq === f) throw new Erreur("Tu es connecté avec ce compte : connecte-toi avec l'autre pour le délier.", 400);
    const idents = await lire(env, "idents:" + c.uid);
    const cibles = idents.filter((k) => k.startsWith(f + ":"));
    if (!cibles.length) throw new Erreur("Aucun compte " + f + " n'est lié.", 404);
    for (const k of cibles) await env.DATA.delete("ident:" + k);
    await ecrire(env, "idents:" + c.uid, idents.filter((k) => !cibles.includes(k)));
    const comptes = (await lire(env, "comptes:" + c.uid, {})) || {};
    delete comptes[f];
    await ecrire(env, "comptes:" + c.uid, comptes);
    return { ok: true };
  }

  /* Fil de publications */
  if (m === "GET" && r === "fil") {
    const c = await contexte(req, env);
    return publications(env, (await lire(env, "fil")).slice(0, 100), c);
  }
  if (m === "POST" && r === "posts" && !a) {
    const c = await exiger(req, env);
    await assurerProfil(env, c);
    const b = await corps();
    const texte = txt(b.texte, 500), image = String(b.image || "");
    if (!texte && !image) throw new Erreur("Écris quelque chose ou ajoute une image.", 400);
    if (image && (!IMG_RE.test(image) || image.length > 300000)) throw new Erreur("Image invalide ou trop lourde (environ 200 Ko maximum).", 400);
    const post = { id: nouvelId(), uid: c.uid, texte, image, date: Date.now(), aime: [] };
    await ecrire(env, "post:" + post.id, post);
    const fil = await lire(env, "fil");
    fil.unshift(post.id);
    await ecrire(env, "fil", fil.slice(0, 300));
    const mes = await lire(env, "posts:" + c.uid);
    mes.unshift(post.id);
    await ecrire(env, "posts:" + c.uid, mes.slice(0, 300));
    return { ok: true, id: post.id };
  }
  if (r === "posts" && a) {
    if (m === "DELETE" && !b2) {
      const c = await exiger(req, env);
      const post = await lire(env, "post:" + a, null);
      if (!post) throw new Erreur("Publication introuvable.", 404);
      if (post.uid !== c.uid && !c.admin && !c.permissions.gererPublications) throw new Erreur("Tu ne peux supprimer que tes publications.", 403);
      await env.DATA.delete("post:" + a);
      await ecrire(env, "fil", (await lire(env, "fil")).filter((x) => x !== a));
      await ecrire(env, "posts:" + post.uid, (await lire(env, "posts:" + post.uid)).filter((x) => x !== a));
      await env.DATA.delete("com:post:" + a);
      return { ok: true };
    }
    if (m === "POST" && b2 === "aime") {
      const c = await exiger(req, env);
      const post = await lire(env, "post:" + a, null);
      if (!post) throw new Erreur("Publication introuvable.", 404);
      post.aime = post.aime.includes(c.uid) ? post.aime.filter((x) => x !== c.uid) : [...post.aime, c.uid];
      await ecrire(env, "post:" + a, post);
      return { aime: post.aime.length, jAime: post.aime.includes(c.uid) };
    }
  }

  /* Commentaires et likes sur les commentaires */
  if (r === "commentaires" && a) {
    const tid = a;
    await tidValide(env, tid);
    const cle = "com:" + tid;
    if (m === "GET" && !b2) {
      const c = await contexte(req, env);
      const coms = await lire(env, cle);
      const auteurs = await infos(env, coms.map((x) => x.uid));
      return {
        commentaires: coms.map((x) => ({
          id: x.id, texte: x.texte, date: x.date, auteur: auteurs[x.uid],
          aime: x.aime.length, jAime: !!c && x.aime.includes(c.uid),
          peutSupprimer: !!c && (c.uid === x.uid || c.admin || !!c.permissions.gererCommentaires),
        })),
      };
    }
    if (m === "POST" && !b2) {
      const c = await exiger(req, env);
      await assurerProfil(env, c);
      const b = await corps();
      const texte = txt(b.texte, 300);
      if (!texte) throw new Erreur("Écris un commentaire.", 400);
      const coms = await lire(env, cle);
      coms.push({ id: nouvelId(), uid: c.uid, texte, date: Date.now(), aime: [] });
      await ecrire(env, cle, coms.slice(-200));
      return { ok: true };
    }
    if (b2 && c2 === "aime" && m === "POST") {
      const c = await exiger(req, env);
      const coms = await lire(env, cle);
      const x = coms.find((y) => y.id === b2);
      if (!x) throw new Erreur("Commentaire introuvable.", 404);
      x.aime = x.aime.includes(c.uid) ? x.aime.filter((y) => y !== c.uid) : [...x.aime, c.uid];
      await ecrire(env, cle, coms);
      return { aime: x.aime.length, jAime: x.aime.includes(c.uid) };
    }
    if (b2 && m === "DELETE" && !c2) {
      const c = await exiger(req, env);
      const coms = await lire(env, cle);
      const x = coms.find((y) => y.id === b2);
      if (!x) throw new Erreur("Commentaire introuvable.", 404);
      if (x.uid !== c.uid && !c.admin && !c.permissions.gererCommentaires) throw new Erreur("Tu ne peux supprimer que tes commentaires.", 403);
      await ecrire(env, cle, coms.filter((y) => y.id !== b2));
      return { ok: true };
    }
  }

  /* Annonces (admin) */
  if (m === "POST" && r === "annonces" && !a) {
    const c = await exigerAdmin(req, env);
    const b = await corps();
    const titre = txt(b.titre, 120);
    if (!titre) throw new Erreur("Le titre est obligatoire.", 400);
    const lien = txt(b.lien, 300);
    if (lien && !/^https?:\/\//i.test(lien)) throw new Erreur("Le lien doit commencer par http:// ou https://", 400);
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    k.annonces.unshift({ id: nouvelId(), titre, texte: txt(b.texte, 2000), lien, date: Date.now(), auteur: c.uid });
    k.annonces = k.annonces.slice(0, 50);
    await ecrire(env, "contenu", k);
    return { ok: true };
  }
  if (m === "DELETE" && r === "annonces" && a) {
    await exigerAdmin(req, env);
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    k.annonces = k.annonces.filter((x) => x.id !== a);
    await ecrire(env, "contenu", k);
    await env.DATA.delete("com:annonce:" + a);
    return { ok: true };
  }

  /* Questionnaires */
  if (m === "POST" && r === "questionnaires" && !a) {
    await exigerAdmin(req, env);
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    k.questionnaires.unshift(nettoyerQuestionnaire(await corps()));
    k.questionnaires = k.questionnaires.slice(0, 30);
    await ecrire(env, "contenu", k);
    return { ok: true };
  }
  if (m === "PATCH" && r === "questionnaires" && a) {
    await exigerAdmin(req, env);
    const b = await corps();
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    const q = k.questionnaires.find((x) => x.id === a);
    if (!q) throw new Erreur("Questionnaire introuvable.", 404);
    q.ouvert = !!b.ouvert;
    await ecrire(env, "contenu", k);
    return { ok: true };
  }
  if (m === "DELETE" && r === "questionnaires" && a) {
    await exigerAdmin(req, env);
    const k = await lire(env, "contenu", { annonces: [], questionnaires: [] });
    k.questionnaires = k.questionnaires.filter((x) => x.id !== a);
    await ecrire(env, "contenu", k);
    await supprimerReponses(env, a);
    return { ok: true };
  }
  if (m === "POST" && r === "reponses" && a) {
    const c = await exiger(req, env);
    const k = await lire(env, "contenu", { questionnaires: [] });
    const q = k.questionnaires.find((x) => x.id === a);
    if (!q) throw new Erreur("Questionnaire introuvable.", 404);
    if (!q.ouvert) throw new Erreur("Ce questionnaire est clos.", 403);
    const cle = "rep:" + q.id + ":" + c.uid;
    if (await env.DATA.get(cle)) throw new Erreur("Tu as déjà répondu.", 409);
    const b = await corps(), saisies = b.reponses || {}, rep = {};
    for (const qu of q.questions) {
      const v = saisies[qu.id];
      if (qu.type === "texte") { const t = txt(v, 500); if (t) rep[qu.id] = t; }
      else if (qu.type === "unique") { if (!qu.options.includes(v)) throw new Erreur("Réponds à toutes les questions à choix.", 400); rep[qu.id] = v; }
      else rep[qu.id] = [...new Set((Array.isArray(v) ? v : []).filter((o) => qu.options.includes(o)))];
    }
    await env.DATA.put(cle, JSON.stringify({ nom: c.nom, uid: c.uid, date: Date.now(), rep }));
    return { ok: true };
  }

  /* Réglages du site (admin) */
  if (m === "PUT" && r === "reglages") {
    await exigerAdmin(req, env);
    const b = await corps();
    const out = await lire(env, "reglages", {});
    if (b.maintenance && typeof b.maintenance === "object") {
      out.maintenance = { ...(out.maintenance || {}) };
      PAGES.forEach((pg) => { if (typeof b.maintenance[pg] === "boolean") out.maintenance[pg] = b.maintenance[pg]; });
    }
    if (b.annonce && typeof b.annonce === "object") {
      const lien = txt(b.annonce.lien, 300);
      if (lien && !/^https?:\/\//i.test(lien)) throw new Erreur("Le lien doit commencer par http:// ou https://", 400);
      out.annonce = { actif: !!b.annonce.actif, texte: txt(b.annonce.texte, 200), lien };
    }
    if (b.siteOptions && typeof b.siteOptions === "object") {
      const current = out.siteOptions || {};
      const input = b.siteOptions;
      const next = { ...current };
      if (input.maintenance && typeof input.maintenance === "object") {
        const message = txt(input.maintenance.message, 500);
        const image = txt(input.maintenance.image, 300000);
        if (image && !/^https:\/\//i.test(image) && !IMG_RE.test(image)) throw new Erreur("L’image de maintenance doit être une URL HTTPS ou une image valide.", 400);
        const ouverture = input.maintenance.ouverture ? Date.parse(input.maintenance.ouverture) : 0;
        if (input.maintenance.ouverture && (!Number.isFinite(ouverture) || ouverture <= Date.now())) throw new Erreur("La date de réouverture doit être dans le futur.", 400);
        next.maintenance = { message, image, ouverture: ouverture || 0 };
      }
      if (input.banniere && typeof input.banniere === "object") {
        const lien = txt(input.banniere.lien, 300);
        if (lien && !/^https:\/\//i.test(lien)) throw new Erreur("Le lien de la bannière doit commencer par https://.", 400);
        next.banniere = { actif: !!input.banniere.actif, texte: txt(input.banniere.texte, 200), lien };
      }
      if (input.popup && typeof input.popup === "object") {
        next.popup = { actif: !!input.popup.actif, titre: txt(input.popup.titre, 100), texte: txt(input.popup.texte, 600) };
      }
      if (input.bienvenue && typeof input.bienvenue === "object") {
        next.bienvenue = { actif: !!input.bienvenue.actif, message: txt(input.bienvenue.message, 150) };
      }
      if (input.pagesActives && typeof input.pagesActives === "object") {
        next.pagesActives = { ...(current.pagesActives || {}) };
        PAGES.forEach((page) => { if (typeof input.pagesActives[page] === "boolean") next.pagesActives[page] = input.pagesActives[page]; });
      }
      if (input.redirections && typeof input.redirections === "object") {
        next.redirections = { ...(current.redirections || {}) };
        PAGES.forEach((page) => {
          if (input.redirections[page] === undefined) return;
          const target = input.redirections[page];
          if (target !== "" && !Object.values(ROUTES).includes(target)) throw new Erreur("Destination de redirection invalide.", 400);
          if (target === ROUTES[page]) throw new Erreur("Une page ne peut pas se rediriger vers elle-même.", 400);
          next.redirections[page] = target;
        });
      }
      if (input.seo && typeof input.seo === "object") {
        next.seo = { titre: txt(input.seo.titre, 100), description: txt(input.seo.description, 250) };
      }
      const disabled = next.pagesActives || {};
      const redirects = next.redirections || {};
      for (const page of PAGES) {
        if (disabled[page] !== false) continue;
        const vus = new Set([page]);
        let actuelle = page;
        while (redirects[actuelle]) {
          const autre = Object.keys(ROUTES).find((key) => ROUTES[key] === redirects[actuelle]);
          if (!autre || disabled[autre] !== false) break;
          if (vus.has(autre)) throw new Erreur("Les redirections créent une boucle.", 400);
          vus.add(autre);
          actuelle = autre;
        }
      }
      out.siteOptions = next;
    }
    if (b.chatbot && typeof b.chatbot.actif === "boolean") out.chatbot = { actif: b.chatbot.actif };
    if (b.partenaires && typeof b.partenaires.afficher === "boolean") out.partenaires = { afficher: b.partenaires.afficher };
    if (b.reglagesParDefaut && typeof b.reglagesParDefaut === "object") {
      out.reglagesParDefaut = { ...(out.reglagesParDefaut || {}) };
      if (b.reglagesParDefaut.theme !== undefined) {
        if (!["normal", "sombre"].includes(b.reglagesParDefaut.theme)) throw new Erreur("Thème par défaut invalide.", 400);
        out.reglagesParDefaut.theme = b.reglagesParDefaut.theme;
      }
      if (typeof b.reglagesParDefaut.musique === "boolean") out.reglagesParDefaut.musique = b.reglagesParDefaut.musique;
    }
    if (typeof b.logo === "string") {
      if (b.logo && (!IMG_RE.test(b.logo) || b.logo.length > 300000)) throw new Erreur("Logo invalide ou trop lourd (environ 200 Ko maximum).", 400);
      out.logo = b.logo;
    }
    if (typeof b.musique === "object" && b.musique) {
      out.musique = { ...(out.musique || {}) };
      if (b.musique.volume !== undefined) out.musique.volume = Math.max(0, Math.min(1, Number(b.musique.volume) || 0));
      if (b.musique.fichier !== undefined) {
        if (typeof b.musique.fichier !== "string" || !/^(?:assets\/[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.mp3$/.test(b.musique.fichier)) {
          throw new Erreur("Fichier de musique invalide.", 400);
        }
        out.musique.fichier = b.musique.fichier;
      }
    }
    await ecrire(env, "reglages", out);
    return { ok: true };
  }

  throw new Erreur("Introuvable.", 404);
}
