# Tombola Felicity Solar Distribution

Application Next.js avec deux espaces :

- `/` : espace public en lecture seule (liste des participants, téléphones partiellement masqués et résultats).
- `/admin` : espace organisateur protégé par un code (import Excel/CSV et tirage).

Chaque numéro de facture est une participation indépendante. Les numéros sont stockés en texte. Un numéro tiré ne peut pas être sélectionné une seconde fois : la fonction SQL réalise la sélection et l'enregistrement dans une transaction verrouillée côté PostgreSQL.

## 1. Installation locale (Windows PowerShell)

Dans le dossier du projet :

```powershell
npm.cmd install
Copy-Item .env.example .env.local
```

Renseignez les quatre variables dans `.env.local` avec les valeurs de votre projet Supabase et un code administrateur robuste.

## 2. Préparer Supabase

1. Créez un projet sur https://supabase.com/.
2. Ouvrez **SQL Editor**.
3. Copiez tout le contenu de `supabase-setup.sql`, collez-le et exécutez-le.
4. Dans **Project Settings > API**, récupérez l'URL, la clé publique anon/publishable et la clé `service_role`.
5. Collez les valeurs dans `.env.local`.

La clé `service_role` est secrète : elle ne doit jamais être exposée dans le navigateur, dans un dépôt public ou dans une variable `NEXT_PUBLIC_`.

## 3. Démarrer

```powershell
npm.cmd run dev
```

- Espace public : http://localhost:3000
- Espace administrateur : http://localhost:3000/admin

Le code administrateur est celui défini dans `ADMIN_ACCESS_CODE`. La page publique est volontairement accessible sans connexion.

## 4. Format du fichier Excel

La première feuille doit contenir une ligne d'en-tête et au minimum ces trois colonnes :

| N° facture | Nom du client | Numéro de téléphone |
|---|---|---|
| FACT-202610-0011 | Moussa | 0758595164 |

Les colonnes peuvent avoir d'autres intitulés usuels (facture/reçu/tombola, nom/client, téléphone/mobile/contact). Si les en-têtes ne sont pas reconnus, l'application utilise les trois premières colonnes dans l'ordre.

Les montants, statuts de paiement et dates ne sont pas importés. Une même personne peut apparaître plusieurs fois avec des numéros de facture différents : chaque facture est une chance distincte. En revanche, un même numéro de facture ne peut apparaître deux fois dans un même fichier.

**Important :** formatez les colonnes `N° facture` et `Téléphone` en **Texte** dans Excel, notamment pour conserver les zéros initiaux des téléphones.

L'import ajoute les nouveaux numéros et actualise les noms/téléphones des numéros déjà présents sans réinitialiser les participations déjà tirées. Il ne supprime pas automatiquement les anciens participants absents d'un nouvel import.

## 5. QR code et accès depuis les téléphones

Le QR code devra contenir l'adresse publique du site déployé, par exemple `https://votre-domaine.tld/`. Il ne faut pas encoder `localhost`, qui ne fonctionne que sur l'ordinateur local.

Déployez le projet sur un hébergeur compatible Next.js (par exemple Vercel), ajoutez les mêmes variables d'environnement dans les paramètres du déploiement, puis générez un QR code à partir de l'URL publique. Tous les visiteurs ouvrent `/`; seul l'organisateur utilise `/admin`.

## 6. Ajouter la réinitialisation sur un projet Supabase déjà configuré

Si le projet Supabase existe déjà, ouvrez **SQL Editor**, copiez le contenu de `supabase-reset-draws.sql` et exécutez-le une seule fois. Cette fonction supprime les lignes de résultats dans `draws`, puis remet `is_drawn` à `false` pour tous les participants. Elle ne supprime aucun participant.

Le bouton **Réinitialiser le tirage** dans `/admin` appelle cette fonction après une confirmation. Il est protégé par le code administrateur. La fonction SQL verrouille le tirage pendant l'opération pour éviter qu'une sélection ne se déroule en même temps.

## 7. Vérifications avant un vrai tirage

- Tester l'import avec un petit fichier de test.
- Ouvrir l'espace public sur un deuxième téléphone et vérifier la liste.
- Lancer un tirage depuis `/admin` et vérifier que le gagnant apparaît sur le téléphone.
- Vérifier qu'un nouveau tirage ne peut pas reprendre le même numéro.
- Tester la réinitialisation : les gagnants disparaissent et tous les participants repassent en jeu.
- Vérifier sur la page publique que le téléphone est masqué.
- Sauvegarder la base avant le tirage officiel.

Le projet fourni prépare les deux espaces et la connexion Supabase. Il faut encore créer/configurer le projet Supabase et déployer l'application pour que les différents téléphones partagent les mêmes données en ligne.
