# webhook-deploy-configuration

Get / set webhook deploy configuration, given a Webhook Firebase root. Where deploy configuration is an array of objects with a `branch` & `bucket`key. The `branch` corresponds to the git branch of templates used, and the `bucket` is the destination for the built templates to reside.

```javascript
var Firebase = require('firebase');
var Deploys = require('webhook-deploy-configuration');

var firebaseUrl = 'my-webhook-project';
var bucketsRoot = new firebase('https://' + firebaseUrl +  '.firebaseio.com/buckets');

var deploys = Deploys( bucketsRoot );

var siteName = 'my-webhook-site';
deploys.get( { siteName: siteName }, function ( error, configuration ) {
  // error: Error | null
  // configuration: { siteName, key, deploys: [ { branch, bucket } ] } | null
} )
```

### API

**get**
Returns all deploy configuration for a site.
`get( { siteName, key? }, function ( error, configuration ) {  } )`


**set**
Sets deploy configuration for a site & branch.
`set( { siteName, key, deploys: [ { branch, bucket } ] }, function ( error, configuration ) {  } )`


**setBucket**
Sets an individual deploy destination with the unique key of `bucket`.
`setBucket( { siteName, key, deploy: { branch, bucket } }, function ( error, configuration ) { } )`


**default**
Returns the default deploy configuration for a site name.
`default( siteName ) => [{ branch, bucket }]`


**setDefault**
Sets the default deploy configuration for a site.
`setDefault( { siteName, key }, function ( error, [ { branch, bucket } ] ) { } )`


**removeBucket**
Removes the deploy configuration
`removeBucket( { siteName, key, bucket }, function ( error, [ { branch, bucket }? ] ) { } )`

### Tests

Include a `.env` file that has the following:

```
SITE_NAME=
FIREBASE_NAME=
FIREBASE_SECRET=
```

- `SITE_NAME` is the string that represends the webhook site name.
- `FIREBASE_NAME` is the Firebase instance that the webhook system is running off of.
- `FIREBASE_SECRET` is the Firebase API key that can be used to authenticate the Firebase instance.

With that in place, `npm run test` to run the tests.
