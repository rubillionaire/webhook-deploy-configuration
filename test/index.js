var path = require( 'path' )
// load `.env.test` into process.env
require( 'dotenv-safe' ).config( {
	allowEmptyValues: true,
  path: path.join( process.cwd(), '.env.test' ),
  sample: path.join( process.cwd(), '.env.test.example' ),
} )
const { initializeApp } = require('firebase/app')
const {
  getDatabase,
  ref,
} = require('firebase/database')
const {
	getAuth,
	signInWithEmailAndPassword,
} = require('firebase/auth')
var Deploys = require('../index.js')
var test = require('tape')

test.onFinish(process.exit)

var siteName = process.env.SITE_NAME;
var firebaseOptions = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${ process.env.FIREBASE_NAME }.firebaseapp.com`,
  databaseURL: `${ process.env.FIREBASE_NAME }.firebaseio.com`,
}

const email = process.env.WEBHOOK_EMAIL
const password = process.env.WEBHOOK_PASSWORD

test( 'deploys-connection', async (t) => {
	const app = initializeApp(firebaseOptions)
	const dbRef = ref(getDatabase(app))
	const auth = getAuth(app)

	const deployConfig = Deploys(dbRef)
	t.ok(true, 'Initialized')

	try {
		await signInWithEmailAndPassword(auth, email, password)
		t.ok(true, 'Signed in')

		let configuration = await deployConfig.get({ siteName })
		t.deepEqual(configuration.deploys, deployConfig.default(siteName), 'Matching default configuration.')

		await deployConfig.set(configuration)
		t.ok(true, 'Deploys set without error.')

		const secondDeployConfiguration = { branch: 'develop', bucket: 'dev.' + siteName }

		let expectedConfiguration = {
			...configuration,
			deploys: configuration.deploys.concat([secondDeployConfiguration])
		}

		const setSecondDeployConfig = await deployConfig.setBucket({
			...configuration,
			deploy: secondDeployConfiguration,
		})

		t.ok(true, 'Second bucket set without error.')
		t.deepEqual(setSecondDeployConfig, expectedConfiguration, 'The configuration that is set equals the expected configuration.')

		const getSecondConfig = await deployConfig.get({ siteName })
		t.ok(true, 'Got second set of configuration without error.')
		t.deepEqual(getSecondConfig.deploys, expectedConfiguration.deploys, 'The non-default configuration set is equal to the configuration retrieved.')

		const removeOpts = {
			...configuration,
			bucket: secondDeployConfiguration.bucket,
		}

		const removeExpectedDeploys = getSecondConfig.deploys.filter(function (deploy) {
			return deploy.bucket !== secondDeployConfiguration.bucket
		})

		const remainingConfiguration = await deployConfig.removeBucket(removeOpts)
		t.ok(true, 'Second bucket removed without error.' )
		t.deepEqual(remainingConfiguration.deploys, removeExpectedDeploys, 'Remaining configuration matches expected configuration.')

		const setDefaultConfig = await deployConfig.setDefault({ siteName: configuration.siteName, key: configuration.key })
		t.ok(true, 'Default configuration set without error.')
		t.deepEqual(setDefaultConfig.deploys, deployConfig.default(siteName), 'Set configuration matches expected default configuration.')

		const noDuplicateSetBucketOptions = {
			siteName,
			key: configuration.key,
			deploy: { branch: 'master', bucket: siteName },
		}

		const noDuplicateSetBucketExpectedConfiguration = {
			siteName,
			key: configuration.key,
			deploys: [{
				branch: 'master',
				bucket: Deploys.utilities.bucketForSiteName(siteName)
			}],
		}

		const setNoDuplicateConfig = await deployConfig.setBucket(noDuplicateSetBucketOptions)
		t.ok(true, 'Dupe default configuration set without error')
		t.deepEqual(setNoDuplicateConfig, noDuplicateSetBucketExpectedConfiguration, 'Dupe prevented')

		const testPairs = [
			{ site: 'test,1risd,1systems', branch: 'master', expected: 'test,1risd,1systems_master.zip' },
			{ site: 'test,1risd,1systems', branch: 'develop', expected: 'test,1risd,1systems_develop.zip' },
			{ site: 'test,1risd,1systems', branch: 'feature/new-homepage', expected: 'test,1risd,1systems_feature-new-homepage.zip' }
		]
		testPairs.forEach( function ( testPair ) {
			const fileName = Deploys.utilities.fileForSiteBranch(testPair.site, testPair.branch)
			const message = [
				'fileForSiteBranch produced expected file name',
				testPair.expected,
				'from site', testPair.site,
				'and branch', testPair.branch
			].join( ' ' );

			t.equal( fileName, testPair.expected, message )
		})
	}
	catch (error) {
		console.log(error)
		t.fail(error)
	}
	finally {
		t.end()
	}
} )
