# Mise à jour — Tombola Felicity Solar Distribution

Cette version fait évoluer l'application existante pour permettre d'organiser plusieurs tombolas avec la même installation Next.js + Supabase.

## Nouveautés

- Bouton **Actualiser les données** dans l'administration.
- Création d'une nouvelle tombola avec un nom.
- Deux modes au démarrage d'une nouvelle tombola :
  - **Archiver l'ancienne** : les anciens participants et gagnants sont conservés dans l'historique.
  - **Tout remplacer** : les participants et résultats de la tombola active précédente sont supprimés définitivement. Une trace de son nom et de son statut reste dans la liste.
- Import d'un nouveau fichier Excel/CSV pour la tombola active.
- Export de la liste active en Excel ou CSV.
- Les données de chaque tombola sont séparées : un même numéro de facture peut être utilisé dans deux campagnes différentes.
- La page publique affiche uniquement la tombola actuellement active et masque les téléphones.
- Le lancement du tirage est synchronisé entre l’administration et la page publique : défilement des numéros, ralentissement progressif et révélation du gagnant.
- Une musique de suspense synthétisée par le navigateur accompagne le mélange, suivie d’un son de victoire. Le visiteur doit activer le son une première fois sur son téléphone ou sur l’ordinateur de projection.
- La page publique propose un mode projection plein écran, un QR code et un bouton pour copier le lien public.
- Réinitialiser le tirage conserve la liste des participants de la tombola active et efface seulement ses gagnants.

L'import utilise les trois premières colonnes : numéro de facture, nom du client, téléphone. Les colonnes suivantes sont ignorées. Un numéro de facture ne peut apparaître qu'une seule fois dans un même fichier.

## 1. Sauvegarder le projet

1. Faites une copie de votre dossier local actuel.
2. Téléchargez et extrayez cette archive.
3. Copiez les fichiers du dossier `tombola-recu` dans votre dossier de projet local.
4. **Ne remplacez pas votre `.env.local` local** : il contient la connexion à Supabase. Il n'est volontairement pas inclus dans cette archive.
5. Vérifiez que `.env.local` reste ignoré par Git (le fichier `.gitignore` le prévoit).

## 2. Mettre à jour Supabase — étape obligatoire

Cette migration est destinée à votre base Supabase actuelle, qui contient déjà les tables `participants` et `draws`.

1. Ouvrez le bon projet Supabase.
2. Ouvrez **SQL Editor** et créez une nouvelle requête.
3. Ouvrez le fichier `supabase-multi-tombolas.sql` à la racine de ce projet.
4. Copiez tout son contenu dans SQL Editor puis cliquez sur **Run**.
5. Vérifiez qu'il n'y a aucune erreur.

La migration crée la table des tombolas, rattache les participants et résultats existants à une première tombola active, puis met à jour les fonctions sécurisées de tirage et de réinitialisation. Elle ajoute aussi le champ `draw_started_at`, utilisé pour synchroniser le départ de l’animation entre l’administration et l’espace public.

**Important :** exécutez cette migration une seule fois. Ne supprimez pas manuellement les tables et ne relancez pas `supabase-setup.sql` sur votre base existante. Faites une sauvegarde de Supabase avant la migration.

## 3. Préparer le projet local

Dans PowerShell, ouvrez le dossier du projet puis lancez :

```powershell
npm.cmd install
npm.cmd run dev
```

Adresses locales :
- Espace public / projection : `http://localhost:3000`
- Administration : `http://localhost:3000/admin`

Pour une séance de tirage, garde l’administration sur l’ordinateur de l’organisateur et ouvre l’espace public dans un deuxième onglet ou sur un deuxième appareil relié au vidéoprojecteur. **Projette uniquement l’espace public** : il est conçu pour l’affichage des animations et des gagnants. Sur l’écran public, clique sur « Activer le son » avant le premier tirage.

Votre `.env.local` doit contenir les variables suivantes (gardez vos vraies valeurs localement) :

```env
NEXT_PUBLIC_SUPABASE_URL=https://VOTRE-PROJET.supabase.co
SUPABASE_SERVICE_ROLE_KEY=VOTRE_CLE_SECRETE_SUPABASE
ADMIN_ACCESS_CODE=VOTRE_CODE_ADMIN_LONG_ET_DIFFICILE
```

La clé `SUPABASE_SERVICE_ROLE_KEY` ne doit jamais être préfixée par `NEXT_PUBLIC_`, partagée, ou envoyée sur GitHub.

## 4. Utiliser plusieurs tombolas

1. Connectez-vous à `/admin`.
2. Dans **Nouvelle tombola**, saisissez un nom, par exemple `Tombola Décembre 2026`.
3. Choisissez le mode :
   - **Archiver l'ancienne tombola** pour garder ses participants et ses gagnants ;
   - **Tout remplacer** pour supprimer les participants et résultats de la tombola active précédente.
4. Confirmez. La nouvelle tombola devient active.
5. Importez son fichier Excel ou CSV.
6. Vérifiez les participants puis lancez les tirages.

L'import d'un fichier dans la tombola déjà active ajoute ou actualise les numéros de facture présents dans ce fichier. Il ne supprime pas automatiquement les autres participants déjà enregistrés dans cette même tombola. Pour commencer une campagne distincte, créez une nouvelle tombola d'abord.

## 5. Actualiser, exporter et réinitialiser

- **Actualiser les données** recharge les participants, résultats et l'historique depuis Supabase.
- **Exporter Excel / Exporter CSV** télécharge la liste de la tombola active avec son statut.
- **Réinitialiser le tirage** efface uniquement les résultats de la tombola active et remet ses participants en jeu.

## 6. Vérifications à effectuer avant la mise en ligne

- Créer une nouvelle tombola en mode archivage et vérifier que l'ancienne apparaît dans l'historique.
- Créer une nouvelle tombola en mode remplacement uniquement après avoir vérifié que la suppression est bien souhaitée.
- Importer un fichier Excel puis un fichier CSV.
- Vérifier que les colonnes après les trois premières ne sont pas utilisées.
- Exporter les participants en Excel et CSV.
- Faire deux tirages et vérifier que le même numéro ne peut pas gagner deux fois dans la campagne.
- Actualiser l'administration et vérifier que les données restent présentes.
- Réinitialiser et vérifier que les participants restent présents et redeviennent disponibles.
- Ouvrir la page publique et vérifier qu’elle ne montre que la campagne active et que les téléphones sont masqués.
- Ouvrir la page publique dans un deuxième onglet ou sur un deuxième appareil, activer le son, puis lancer un tirage depuis l’administration.
- Vérifier que les deux écrans démarrent le défilement, ralentissent et révèlent le même gagnant.
- Tester le mode projection plein écran et le QR code après le déploiement sur une URL publique (pas sur `localhost`).

## 7. GitHub et déploiement

Avant le premier push GitHub, vérifiez impérativement :
- `.env.local` n'est pas dans les fichiers suivis par Git ;
- aucun secret Supabase ni code administrateur n'est inscrit en dur dans les fichiers ;
- le dépôt GitHub est privé pendant les tests.

Sur Vercel, configurez `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` et `ADMIN_ACCESS_CODE` dans les variables d'environnement du projet. Ne téléversez jamais `.env.local`.

Le QR code affiché sur la page publique encode automatiquement son URL actuelle. Il sera donc réellement utilisable après le déploiement sur Vercel ; un QR code vers `localhost` ne fonctionnera pas sur les téléphones. La génération de l’image QR utilise un service en ligne.
