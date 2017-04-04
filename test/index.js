require( 'dotenv' ).config() // load `.env` into process.env

var Firebase = require( 'firebase' )
var miss = require( 'mississippi' )
var extend = require( 'xtend' )
var Deploys = require( '../index.js' )
var test = require( 'tape' )

test.onFinish( function () { process.exit() } )

test( 'deploys-connection', function ( t ) {

	var siteName = process.env.SITE_NAME;

	var deploys = null;
	var setupDeploys = function authFirebaseAndInitDeploys () {
		var firebaseName = process.env.FIREBASE_NAME
		var firebaseSecret = process.env.FIREBASE_SECRET

		var bucketsRoot = new Firebase( 'https://' + firebaseName + '.firebaseio.com/buckets' )

		var stream = miss.through.obj();
		bucketsRoot.auth( firebaseSecret, function ( error ) {
			t.equal( error, null, 'Connected to firebase.' )
			
			deploys = Deploys( bucketsRoot )
			stream.push( { siteName: siteName } )
			stream.push( null )
		} )

		return stream;
	}
	setupDeploys.testCount = 1;

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
		return miss.through.obj( function ( row, enc, next ) {
			deploys.set( row, function ( error ) {
				
				t.equal( error, null, 'Deploys set without error.' )
				
				next( null, row )
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
		testDefaultConfiguration,
		testSetConfiguration,
		testSecondBucket,
		// testSecondBucket,
		testSetDefaultConfig,
		testFileForSiteBranch
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
