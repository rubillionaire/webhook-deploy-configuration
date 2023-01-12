# webhook-deploy-configuration

Get / set webhook site deploy configuration, given a Webhook Firebase root. Where deploy configuration is an array of objects with a `branch` & `bucket` key. The `branch` corresponds to the git branch of templates used, and the `bucket` is the destination for the built templates to reside.

```javascript
const { initializeApp } = require("firebase/app")
const {
  getDatabase,
  ref,
} = require("firebase/database")
const Deploys = require('webhook-deploy-configuration')

const app = initializeApp({
  apiKey,
  authDomain: `${firebaseName}.firebaseapp.com`,
  databaseURL: `https://${firebaseName}.firebaseio.com`,
  projectId,
})

const deploys = Deploys(ref(getDatabase(app)));

;(async () => {
  const siteName = 'my-webhook-site';
  const config = await deploys.get({ siteName })
  // config : { siteName, key, deploys: [{ bucket, branch }] }
})()
```

### API

**get**
Returns all deploy configuration for a site.
`get({ siteName, key? }) => config : { siteName, key, deploys: [{ bucket, branch }] }`


**set**
Sets deploy configuration for a site & branch.
`set({ siteName, key, deploys: [ { branch, bucket } ] }) => config : { siteName, key, deploys: [{ bucket, branch }] }`


**setBucket**
Sets an individual deploy destination with the unique key of `bucket`.
`setBucket({ siteName, key, deploy: { branch, bucket } }) => config : { siteName, key, deploys: [{ bucket, branch }] }`


**default**
Returns the default deploy configuration for a site name.
`default( siteName ) => [{ branch, bucket }]`


**setDefault**
Sets the default deploy configuration for a site.
`setDefault({ siteName, key }) => config : { siteName, key, deploys: [{ bucket, branch }] }`


**removeBucket**
Removes the deploy configuration
`removeBucket({ siteName, key, bucket }) => config : { siteName, key, deploys: [{ bucket, branch }] }`

### Tests

Include a `.env.test` file that has the following:

```
SITE_NAME=
FIREBASE_NAME=
FIREBASE_SERVICE_ACCOUNT_KEY=
```

- `SITE_NAME` is the string that represends the webhook site name.
- `FIREBASE_NAME` is the Firebase instance that the webhook system is running off of.
- `FIREBASE_SECRET` is the path to the Firebase Service Account credentials that can be used to authenticate the Firebase instance.

With that in place, and an existing webhook site by the name of the given `SITE_NAME`, `npm run test` to run the tests.
