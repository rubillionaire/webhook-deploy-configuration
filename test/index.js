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
var miss = require( 'mississippi' )
var extend = require( 'xtend' )
var Deploys = require( '../index.js' )
var test = require( 'tape' )

test.onFinish( function () { process.exit() } )



var siteName = process.env.SITE_NAME;
var firebaseOptions = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: `${ process.env.FIREBASE_NAME }.firebaseapp.com`,
  databaseURL: `${ process.env.FIREBASE_NAME }.firebaseio.com`,
}

const email = process.env.WEBHOOK_EMAIL
const password = process.env.WEBHOOK_PASSWORD

test( 'deploys-connection', function ( t ) {

	var deploys = null;

	const app = initializeApp(firebaseOptions)
	const dbRef = ref(getDatabase(app))
	const auth = getAuth(app)

	var setupDeploys = function authFirebaseAndInitDeploys () {
		deploys = Deploys(dbRef)

		const stream = miss.through.obj()

		process.nextTick( function () {
			t.assert( typeof deploys === 'object', 'Deploys object setup.' )
			
			stream.push( { siteName: siteName } )
			stream.push( null )
		} )
		

		return stream;
	}
	setupDeploys.testCount = 1;

	const signIntoFirebase = function () {
		return miss.through.obj(function (row, enc, next) {
			signInWithEmailAndPassword(auth, email, password)
				.then(() => {
					t.ok(true, 'Logged into firebase')
					next(null, row)
				})
				.catch((error) => {
					throw error
				})
		})
	}
	signIntoFirebase.testCount = 1

	var testDefaultConfiguration = function () {
		return miss.through.obj( function ( row, enc, next ) {
			deploys.get( { siteName: siteName }, function ( error, configuration ) {
				t.equal( error, null, 'Got default configuration without error.' )
				t.deepEqual( configuration.deploys, deploys.default( siteName ), 'Matching default configuration.' )
				
				next( null, configuration )
			} )
		} )
	}
	testDefaultConfiguration.testCount = 2;

	var testSetConfiguration = function () {
		return miss.through.obj( function ( deployConfiguration, enc, next ) {
			deploys.set( deployConfiguration, function ( error ) {
				
				t.equal( error, null, 'Deploys set without error.' )
				
				next( null, deployConfiguration )
			} )
		} )
	}
	testSetConfiguration.testCount = 1;

	var secondDeployConfiguration = { branch: 'develop', bucket: 'dev.' + siteName };

	var testSecondBucket = function () {

		return miss.through.obj( function ( row, enc, next ) {

			var opts = { siteName: row.siteName, key: row.key, deploy: secondDeployConfiguration }

			var expectedConfiguration = extend( row, {
				deploys: row.deploys.concat( [ secondDeployConfiguration ] )
			} )

			deploys.setBucket( opts, function ( error, setConfiguration ) {
				
				t.equal( error, null, 'Second bucket set without error.' )
				t.deepEqual( setConfiguration, expectedConfiguration, 'The configuration that is set equals the expected configuration.' )
				
				next( null, expectedConfiguration );
			} )
		} )
	}
	testSecondBucket.testCount = 2;

	var testNonDefaultBucketConfig = function () {
		return miss.through.obj( function ( row, enc, next ) {

			deploys.get( { siteName: row.siteName }, function ( error, retrievedConfiguration ) {
				t.equal( error, null, 'Got second set of configuration without error.' )
				t.deepEqual( retrievedConfiguration.deploys, row.deploys, 'The non-default configuration set is equal to the configuration retrieved.')

				next( null, row )
			} )

		} )
	}
	testNonDefaultBucketConfig.testCount = 2;

	var testRemoveSecondBucketConfig = function () {
		return miss.through.obj ( function ( row, enc, next ) {
			var opts = { siteName: row.siteName, key: row.key, bucket: secondDeployConfiguration.bucket }
			
			var expectedConfiguration = row.deploys.filter( function ( deploy ) { return deploy.bucket !== secondDeployConfiguration.bucket } );

			deploys.removeBucket( opts, function ( error, remainingConfiguration ) {
				t.equal( error, null, 'Second bucket removed without error.' )
				t.deepEqual( remainingConfiguration, expectedConfiguration, 'Remaining configuration matches expected configuration.' );

				next( null, extend( row, { deploys: remainingConfiguration } ) );
			} )
		} )
	}
	testRemoveSecondBucketConfig.testCount = 2;

	var testSetDefaultConfig = function () {
		return miss.through.obj( function ( row, enc, next ) {
			var opts = { siteName: row.siteName, key: row.key };
			var expectedConfiguration = deploys.default( opts.siteName )

			deploys.setDefault( opts, function ( error, configuration ) {
				t.equal( error, null, 'Default configuration set without error.' )
				t.deepEqual( configuration, expectedConfiguration, 'Set configuration matches expected default configuration.' );

				next( null, extend( row, { deploys: configuration } ) )

			} )
		} )
	}
	testSetDefaultConfig.testCount = 2;

	var testNoDuplicateSet = function () {
		return miss.through.obj( function ( row, enc, next ) {
			var opts = { siteName: row.siteName, key: row.key, deploy: { branch: 'master', bucket: row.siteName } }
			var expectedConfiguration = {
				siteName: row.siteName,
				key: row.key,
				deploys: [ { branch: 'master', bucket: Deploys.utilities.bucketForSiteName( row.siteName ) } ],
			}

			deploys.setBucket( opts, function ( error, configuration ) {
				t.equal( error, null, 'Dupe default configuration set without error' )
				t.deepEqual( configuration, expectedConfiguration, 'Dupe prevented' )
				next( null, row )
			} )
		} )
	}
	testNoDuplicateSet.testCount = 2;

	var testFileForSiteBranch = function () {
		var testPairs = [
			{ site: 'test,1risd,1systems', branch: 'master', expected: 'test,1risd,1systems_master.zip' },
			{ site: 'test,1risd,1systems', branch: 'develop', expected: 'test,1risd,1systems_develop.zip' },
			{ site: 'test,1risd,1systems', branch: 'feature/new-homepage', expected: 'test,1risd,1systems_feature-new-homepage.zip' }
		]
		return miss.through.obj( function ( row, enc, next ) {

			testPairs.forEach( function ( testPair ) {
				var fileName = Deploys.utilities.fileForSiteBranch( testPair.site, testPair.branch );
				var message = [
					'fileForSiteBranch produced expected file name',
					testPair.expected,
					'from site', testPair.site,
					'and branch', testPair.branch
				].join( ' ' );

				t.equal( fileName, testPair.expected, message )
			} )

			next( null, row )

		} )
	}
	testFileForSiteBranch.testCount = 3;

	var testsToRun = [
		setupDeploys,
		signIntoFirebase,
		testDefaultConfiguration,
		testSetConfiguration,
		testSecondBucket,
		testNonDefaultBucketConfig,
		testSetDefaultConfig,
		testNoDuplicateSet,
		testFileForSiteBranch,
	];

	runTests( testsToRun )

	function runTests ( tests ) {
		var count = tests
			.map( function ( testFn ) { return testFn.testCount } )
			.reduce( function ( previous, current ) { return previous + current }, 0 )

		t.plan( count )

		miss.pipe.apply( null, tests
			.map( function ( testFn ) { return testFn() }  )
				.concat( [ sink ] ) )

		function sink ( error ) {
			if ( error ) console.log( error )
		}
	}

} )
