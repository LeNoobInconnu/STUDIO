/* ==========================================================================
   RÉGLAGES DU SITE LeNoobInconnu
   C'est le seul fichier à modifier pour piloter le site.
   Règle : change ce qui est entre guillemets, ou passe true / false.
   ========================================================================== */
var SITE = {

  nom: "LeNoobInconnu",

  /* ---------- LOGO ----------
     Dépose ton logo dans le dossier "assets" et mets son nom ici.
     Tant que le fichier n'existe pas, le nom de la chaîne s'affiche. */
  logo: "assets/logo.png",

  /* ---------- VIDÉO DE L'ACCUEIL ----------
     Dans https://www.youtube.com/watch?v=ABCDEFGHIJK, l'identifiant est ABCDEFGHIJK. */
  videoId: "ylwBQmnzYaQ",

  /* ---------- LIENS IMPORTANTS ----------
     Un lien modifié ici change sur toutes les pages.
     boutique : laisse "" pour ne pas afficher de bouton Boutique.
     contact  : laisse "" pour garder la page contact.html, ou mets une adresse
                (formulaire, Linktree...) pour que "Contact" y mène directement. */
  liens: {
    youtube: "https://www.youtube.com/@LeNoobInconnu",
    twitch: "https://www.twitch.tv/lenoobinconnu",
    discord: "https://discord.gg/ton-invitation",
    x: "https://x.com/lenoobinconnu",
    instagram: "https://www.instagram.com/lenoobinconnu",
    boutique: "",
    contact: ""
  },

  /* Adresse e-mail affichée sur la page Contact (laisse "" pour la cacher) */
  email: "contact.lenoobinconnu@gmail.com",

  /* ---------- ANNONCE GLOBALE ----------
     Bandeau affiché en haut de toutes les pages.
     actif : true pour l'afficher, false pour le retirer.
     lien  : laisse "" pour un bandeau sans lien.
     fermable : true permet au visiteur de le fermer (il revient si tu changes le texte). */
  annonce: {
    actif: true,
    texte: "En développement",
    lien: "",
    texteLien: "Voir la chaîne",
    fermable: true
  },

  /* ---------- PROJETS ----------
     La liste de tous tes projets (affichée sur la page Séries).
     id      : un nom court sans espace, utilisé plus bas.
     lien    : l'adresse du projet (laisse "" pour envoyer vers ta chaîne YouTube).
     couleur : la couleur de la carte (code hexadécimal). */
  projets: [
    { id: "premiers-pas", numero: "01", titre: "Premiers pas", tag: "Nouveau", couleur: "#fff566", lien: "",
      description: "Le noob se lance et apprend en direct, sans filet." },
    { id: "defis", numero: "02", titre: "Défis impossibles", tag: "Série en cours", couleur: "#ff7b6b", lien: "",
      description: "Des règles absurdes et un seul objectif, tenir jusqu'au bout." },
    { id: "construction", numero: "03", titre: "Construction", tag: "Ouvert à tous", couleur: "#6bcbff", lien: "",
      description: "Des projets montés de zéro, du premier bloc à l'inauguration." },
    { id: "survie", numero: "04", titre: "Survie", tag: "Série en cours", couleur: "#6bffef", lien: "",
      description: "Un monde, une aventure et le moins d'aide possible." },
    { id: "duels", numero: "05", titre: "Duels entre amis", tag: "Avec la team", couleur: "#d86bff", lien: "",
      description: "Des affrontements où le perdant paye un gage." },
    { id: "moments", numero: "06", titre: "Les meilleurs moments", tag: "Archives", couleur: "#b8ff6b", lien: "",
      description: "Les montages que vous avez le plus regardés." }
  ],

  /* Projet mis en avant en grand sur l'accueil (mets l'id d'un projet, ou "" pour aucun) */
  projetMisEnAvant: "defis",

  /* Projets affichés dans la grille de l'accueil (les id, dans l'ordre voulu) */
  projetsAccueil: ["premiers-pas", "construction", "survie"],

  /* ---------- PARTENAIRES (carrousel de l'accueil) ----------
     afficher : false pour cacher tout le carrousel.
     vitesse  : durée d'un tour complet en secondes (plus grand = plus lent).
     liste    : un logo par ligne. Dépose les images dans assets/partenaires/.
                Sans fichier image, le nom s'affiche à la place.
                lien : laisse "" si le partenaire n'a pas de page. */
  partenaires: {
    afficher: true,
    titre: "Chaînes et marques affiliées",
    vitesse: 30,
    liste: [
      { nom: "Partenaire 1", logo: "assets/partenaires/partenaire-1.png", lien: "" },
      { nom: "Partenaire 2", logo: "assets/partenaires/partenaire-2.png", lien: "" },
      { nom: "Partenaire 3", logo: "assets/partenaires/partenaire-3.png", lien: "" },
    ]
  },

  /* ---------- MUSIQUE ----------
     Dépose ton fichier .mp3 dans "assets" avec ce nom (ou change le nom ici).
     volume : de 0 (muet) à 1 (maximum), c'est le volume de départ. */
  musique: {
    fichier: "assets/musique.mp3",
    volume: 0.3
  },

  /* ---------- RÉGLAGES PAR DÉFAUT DES VISITEURS ----------
     theme   : "normal" ou "sombre"
     musique : false = coupée au premier passage (conseillé), true = lancée dès que possible.
     Les choix d'un visiteur sont gardés d'une page à l'autre. */
  reglagesParDefaut: {
    theme: "normal",
    musique: false
  },

  /* ---------- MAINTENANCE ----------
     true = la page affiche un message de maintenance, false = page normale. */
  maintenance: {
    accueil: false,
    programme: true,
    series: true,
    communaute: true,
    contact: false,
    mentions: false
  },
  messageMaintenance: "Cette page est en travaux. Reviens bientôt, ou rejoins le Discord pour suivre les nouveautés."
};
