var miss = require('mississippi');
var extend = require('xtend');

var defaultBranch = 'master';

module.exports = Deploys;
module.exports.utilities = {
	defaultBranch: function () {
		return defaultBranch;
	},
	nameForSiteBranch: nameForSiteBranch,
	fileForSiteBranch: fileForSiteBranch,
}


/**
 * Manage deploy configuration.
 * 
 * @param {object}  firebaseRoot      Webhook firebase database ref
 */
function Deploys ( firebaseRoot ) {
  if ( ! ( this instanceof Deploys ) ) return new Deploys( firebaseRoot );

  var noDeployConfigurationError = new Error( 'No deploy configuration.' );
  var siteDoesNotExistError = new Error( 'Site does not exist in Firebase.' );

	return {
		get: getFirebaseConfiguration,
		set: setFirebaseConfiguration,
		setBucket: setBucketConfiguration,
		default: defaultConfiguration,
		valid: areValidDeploys,
		setDefault: setDefaultFirebaseConfiguration,
		removeBucket: removeBucketFirebaseConfiguration,
	}

	/**
	 * Return the site key for a given `siteName`.
	 * 
	 * @param  {string}
	 * @param  {Function}
	 * @return {undefined}
	 */
	function getKeyForSite ( siteName, callback )  {
		try {
			firebaseRoot.ref('management/sites')
				.child(siteNameForBucket( siteName ))
				.child('key')
				.once('value',
					function success ( snapshot ) {
						callback( undefined, snapshot.val() )
					},
					function ( error ) {
						callback( error )
					})
		} catch ( error ) {
			callback( siteDoesNotExistError )
		}
	}

	/**
	 * Transform stream wrapper around `getKeyForSite`.
	 * 
	 * @return {object}
	 */
	function getKeyForSiteStream () {
		return miss.through.obj( function ( row, enc, next) {
			getKeyForSite( row.siteName, function onKey ( error, key ) {
				if ( error ) next( error )
				else next( null, extend( row, { key: key } ) )
			} )
		} )
	}

	/**
	 * Returns the deploy configuration for a site, given
	 * its `siteName` and `key`.
	 * 
	 * @param  {string}    siteName
	 * @param  {string}    key
	 * @param  {Function}  callback
	 * @return {undefined}
	 */
	function getDeploysForSiteAndKey ( siteName, key, callback ) {
		try {
			firebaseRoot.ref('buckets')
				.child(siteNameForBucket( siteName ))
				.child(key)
				.child('dev/deploys')
				.once('value',
					function onSnapshot (snapshot) {
						var firebaseConfiguration = snapshot.val();

						if ( areValidDeploys( firebaseConfiguration ) ) callback( undefined, firebaseConfiguration )
						else callback( noDeployConfigurationError )
					},
					function onError (err) {
						callback( noDeployConfigurationError )
					});
		}
		catch ( error ) {
			callback( siteDoesNotExistError )
		}
	}

	/**
	 * Transform stream wrapper around `getDeploysForSiteAndKey`
	 * @return {object}
	 */
	function getDeploysForSiteAndKeyStream () {
		return miss.through.obj( function ( row, enc, next ) {
			getDeploysForSiteAndKey( row.siteName, row.key, function ( error, configuration ) {
				if ( error ) configuration = defaultConfiguration( row.siteName );
				next( null, extend( row, { deploys: configuration } ) )
			} )
		} )
	}

	/**
	 * Expects an `opts` object that contains at least a `siteName`.
	 * If an `key` is provided, that will not be queried for.
	 * 
	 * Returns a series of streams that can be piped together to produce
	 * an object that contains `{ siteName, key, deploys }` keys.
	 * Where `siteName` is the name of the site, `key` is its authentication
	 * key, and `deploys` is an array of deploy configuration.
	 * 
	 * @param  {object} opts
	 * @param  {string} opts.siteName
	 * @param  {string} opts.key
	 * @return {object} pipeline Array of streams to pipe together
	 */
	function getDeploysStreamsPipeline ( opts ) {
		var pipeline = [ source( opts ) ];

		if ( ! ( isStringWithLength( opts.key ) ) )
			pipeline = pipeline.concat([ getKeyForSiteStream() ])

		pipeline = pipeline.concat([ getDeploysForSiteAndKeyStream() ])

		return pipeline;

		function source( opts ) {
			return miss.from.obj([{
				siteName: siteNameForBucket( opts.siteName ),
				key: opts.key || null
			}, null]);
		}
	}


	/**
	 * Get the deploy configuration in the firebase bucket tree.
	 * Having no configuration returns a default configuration.
	 *
	 * @param  {object}    opts          [description]
	 * @param  {string}    opts.siteName [description]
	 * @param  {string?}   opts.key      [description]
	 * @param  {function}  Callback with deploy settings
	 * @return {undefined}
	 */
	function getFirebaseConfiguration ( opts, callback ) {
		if ( typeof opts !== 'object' ) opts = {};
		if ( ! ( isStringWithLength( opts.siteName ) ) )
			return callback( new Error( 'Requires site name.' ) )

		var pipeline = getDeploysStreamsPipeline( opts );

		pipeline = pipeline.concat([
			onSuccess( callback ),
			onError( callback )
		]);

		return miss.pipe.apply( null, pipeline )

		function onSuccess ( callback ) {
			return miss.through.obj( function ( row, enc, next ) {
				callback( null, row );
				next();
			} )
		}

		function onError ( callback ) {
			return function captureError ( error ) {
				if ( error ) callback( error )
			}
		}	
	}

	/**
	 * Set the deploy configuration in the firebase bucket tree.
	 * 
	 * @param  {object}   opts
	 * @param  {string}   opts.siteName
	 * @param  {string}   opts.key
	 * @param  {object}   opts.deploys
	 * @param  {string}   opts.deploys[].buckets
	 * @param  {function} Callback with error if could not be set
	 * @return {undefined}
	 */
	function setFirebaseConfiguration ( opts, callback ) {
		if ( ! ( areValidSetterOpts(opts) ) )
			callback( new Error( 'Options for deploys.setter not valid.' ) )

		firebaseRoot.ref( 'buckets' ).child(siteNameForBucket(opts.siteName)).child( opts.key )
			.child('dev/deploys')
			.set( bucketNamesForSiteNames( opts.deploys ), callback );

		// local validation
		function areValidSetterOpts (opts) {
			var isValid = false;

			try {
				isValid = isStringWithLength( opts.siteName ) &&
					isStringWithLength( opts.key ) &&
					areValidDeploys( opts.deploys )
			} catch ( error ) {
				// console.log( error )
			}
			return isValid;
		}
	}

	/**
	 * Transform stream wrapper around `setFirebaseConfiguration`
	 */
	function setFirebaseConfigurationStream () {
		return miss.through.obj( function( row, enc, next ) {
			try {
				setFirebaseConfiguration(
					{ siteName: row.siteName, key: row.key, deploys: row.deploys },
					function onSet ( error ) {
						if ( error ) next( error )
						else next( null, row )
					} )
			} catch ( error ) {
				next( error )
			}
		} )
	}

	/**
	 * @param {object}    opts
	 * @param {string}    opts.siteName  The site to set configuration for
	 * @param {string}    opts.key       The site key for authentication
	 * @param {object}    opts.deploy    The deploy configuration to use
	 * @param {string}    opts.deploy.bucket    The bucket to deploy to.
	 * @param {string}    opts.deploy.branch    The branch of templates to use in deploying.
	 * @param {undefined}
	 */
	function setBucketConfiguration ( opts, callback ) {
		if ( ! ( areValidBucketSetterOpts( opts ) ) )
			return callback( new Error( 'Options for deploys.setter not valid.' ) )

		var pipeline = getDeploysStreamsPipeline( opts )
			.concat([ updateConfigurationStream( opts.deploy ),
				        setFirebaseConfigurationStream(),
				        onSuccess( callback ),
				        onError( callback ) ]);

		return miss.pipe.apply( null, pipeline );

		function updateConfigurationStream ( deployOptions ) {
			return miss.through.obj( function ( row, enc, next ) {
				try {
					var matchingDeployIndices = row.deploys
						.map( function configIndexForBranch ( deploy, configIndex ) {
							if ( deploy.bucket === deployOptions.bucket ) return configIndex;
							else return null;
						} )
						.filter( function isNumber ( configIndex ) {
							return typeof configIndex === 'number'
						} )

					// defaults to adding to the end of the array
					var indexToUpdate = row.deploys.length;
					// defaults to an empty object
					var currentConfiguration = {};
					var configurationToSet = extend( {}, deployOptions )

					if ( matchingDeployIndices.length === 1  ) {
						indexToUpdate = matchingDeployIndices[ 0 ];
						currentConfiguration = row.deploys[ indexToUpdate ];
					}

					row.deploys[ indexToUpdate ] = extend( currentConfiguration, configurationToSet )

					next( null,  row )
				} catch ( error ) {
					next( error )
				}
			} )
		}

		function onSuccess ( callback ) {
			return miss.through.obj( function ( row, enc, next ) {
				callback( null, row )
				next();
			} )
		}

		function onError ( callback ) {
			return function captureError ( error ) {
				if ( error ) callback( error )
			}
		}

		// local validation
		function areValidBucketSetterOpts( opts ) {
			var isValid = false;
			try {
				isValid = isStringWithLength( opts.siteName ) &&
					isStringWithLength( opts.key ) &&
					areValidDeploys( [ opts.deploy ] );
			} catch ( error ) {
				// console.log( error )
			}

			return isValid;
		}
	}

	function defaultConfiguration ( siteName ) {
		// escaped site name is expected
		return [{
			bucket: bucketForSiteName( siteName ),
			branch: defaultBranch,
		}];
	}

	/**
	 * @param  {objects}   opts
	 * @param  {string}    opts.siteName
	 * @param  {string}    opts.key
	 * @param  {string}    opts.bucket
	 * @param  {Function}  callback
	 * @return {undefined}
	 */
	function removeBucketFirebaseConfiguration ( opts, callback ) {
		var validatedOptions = areValidRemoveBucketOpts( opts )
		if ( validatedOptions instanceof Error ) return callback( validatedOptions )

		var bucketDeployToRemove = bucketForSiteName( opts.bucket );

    var deploysRef = firebaseRoot.ref( 'buckets' ).child(siteNameForBucket( opts.siteName ) ).child( opts.key ).child( 'dev/deploys' )

    deploysRef
      .once( 'value', function ( snapshot ) {
        var deploys = snapshot.val();

        if ( Array.isArray( deploys ) ) {

          deploys = removeBucketDeploy( deploys )
          if ( deploys ) {

            deploysRef.set( deploys, function ( error ) {
              if ( error ) callback( error )
              else ( callback( null, deploys ) )
            } )

          } else callback ( new Error( 'Could not remove bucket from deploys.' ) )

        } else callback( new Error( 'Deploys not found.' ) )

      } )
      // .transaction( removeBucketDeploy, onTransactionComplete )

		/**
		 * @param  {object} deploys The current deploys for the site.
		 * @return {object|undefined} deploysToKeep The deploys after removing the specified bucket.
		 */
		function removeBucketDeploy ( deploys ) {
			
			var deploysToKeep = undefined;

			try {
				deploysToKeep = deploys.filter( function ( deploy ) {
					return deploy.bucket !== bucketDeployToRemove;
				} )

				if ( deploysToKeep.length === ( deploys.length - 1 ) ) return deploysToKeep;

			} catch ( error ) {
				// console.log( error );
			}
			return deploysToKeep;
		}

		function onTransactionComplete ( error, committed, snapshot ) {
			if ( error ) return callback( error )
			else if ( !committed ) return callback( 'Transaction returned undefined.' )
			else return callback( null, snapshot.val() )
		}

		/**
		 * @param  {object?}     opts
		 * @param  {string?}     opts.siteName
		 * @param  {string?}     opts.key
		 * @param  {string?}     opts.bucket
		 * @return {true|Error}
		 */
		function areValidRemoveBucketOpts( opts ) {

			var errorMessage = [
				'Removing a bucket from the deploy configuration requires ',
				'passing in an object of options that include a key for ',
				'the site name ( `siteName` ), the site key ( `key` ) & the ',
				'storage bucket ( `bucket` ) that you would like to no ',
				'longer deploy to.'
			].join('')
			var isValid = new Error( errorMessage );

			try {
				var namedTests = [
					{ name: 'siteName', test: isStringWithLength( opts.siteName ) },
					{ name: 'key', test: isStringWithLength( opts.key ) },
					{ name: 'bucket', test: isStringWithLength( opts.bucket ) }
				]

				return areValidOptsTester( errorMessage, namedTests )

			} catch ( error ) {
				error.message = [ errorMessage, error.message ].join( '\n' );
				isValid = error;
			}

			return isValid;
		}
	}

	/**
	 * @param  {objects}   opts
	 * @param  {string}    opts.siteName
	 * @param  {string}    opts.key
	 * @param  {Function}  callback
	 * @return {undefined}
	 */
	function setDefaultFirebaseConfiguration ( opts, callback ) {
		var validatedOptions = areValidRemoveBucketOpts( opts )
		if ( validatedOptions instanceof Error ) return callback( validatedOptions )

		var defaultDeployConfiguration = defaultConfiguration( opts.siteName )

		firebaseRoot.ref( 'buckets' ).child( siteNameForBucket( opts.siteName ) ).child( opts.key )
			.child( 'dev/deploys' )
			.set( defaultDeployConfiguration, onSetComplete );

		/**
		 * @param  {object?}     opts
		 * @param  {string?}     opts.siteName
		 * @param  {string?}     opts.key
		 * @return {true|Error}
		 */
		function areValidRemoveBucketOpts( opts ) {

			var errorMessage = [
				'Setting default configuration requires ',
				'passing in an object of options that include a key for ',
				'the site name ( `siteName` ) & the site key ( `key` ) ',
				'you would like to give default deploy configuration to. '
			].join('')
			var isValid = new Error( errorMessage );

			try {
				var namedTests = [
					{ name: 'siteName', test: isStringWithLength( opts.siteName ) },
					{ name: 'key', test: isStringWithLength( opts.key ) }
				]

				return areValidOptsTester( errorMessage, namedTests )

			} catch ( error ) {
				error.message = [ errorMessage, error.message ].join( '\n' );
				isValid = error;
			}

			return isValid;
		}

		/**
		 * Used to propogate the error to the callback or
		 * if there is no error, return the configuration that
		 * was set.
		 * 
		 * @param  {null|Error} error
		 * @return {undefined}
		 */
		function onSetComplete ( error ) {
			if ( error ) return callback( error )
			else return callback( null, defaultDeployConfiguration )
		}
	}

}

// utilities

function siteNameForBucket ( bucketName ) {
  return bucketName.replace( /\./g, ',1' );
}

function bucketForSiteName ( siteName ) {
	return siteName.replace( /,1/g, '.' );
}

function nameForSiteBranch ( site, branch ) {
	branch = branch.replace( /\//g, '-' )
	return [ site, branch ].join( '_' )
}

function fileForSiteBranch ( site, branch ) {
	var fileName = nameForSiteBranch( site, branch )
	var fileExt = 'zip';
	return [ fileName, fileExt ].join( '.' )
}

// validation functions

function isStringWithLength ( str ) {
	return typeof str === 'string' && str.length > 0;
}

function areValidDeploys ( deployConfig ) {
	var isValid = false;

	try {
		isValid = deployConfig.filter( function isValidDeploy ( deploy ) {
			return (isStringWithLength( deploy.bucket ) &&
						  isStringWithLength( deploy.branch ));
		} )
		.length === deployConfig.length;
	} catch ( error ) {
		// console.log( error )
	}

	return isValid;
}

function bucketNamesForSiteNames ( deployConfig ) {
	return deployConfig.map( function ( deploy ) {
		deploy.bucket = bucketForSiteName( deploy.bucket )
		return deploy
	} );
}

/**
 * @param  {string} baseErrorMessage  The error message that is always included.
 * 																	  This is extended by specific errors that are found by failed tests.
 * @param  {object}  tests[]
 * @param  {string}  tests[].name     The name of the key being tested
 * @param  {boolean} tests[].test     The result of the test
 * @return {true|Error}
 */
function areValidOptsTester ( baseErrorMessage, tests ) {
	var isValid = new Error( baseErrorMessage )
	try {
		var failedTests = tests.filter( function ( namedTest ) { return namedTest.test === false  } )	
		if ( failedTests.length === 0 ) return ( isValid = true )
		var additionalErrorMessage = failedTests.map( function ( namedTest ) {
			return [ namedTest.name, 'was not a valid string.\n' ].join(': ');
		} )

		isValid = new Error( [ baseErrorMessage, additionalErrorMessage ].join( '\n' ) )
	
	} catch ( error ) {
		error.message = [ baseErrorMessage, error.message ].join( '\n' );
		isValid = error;
	}
	
	return isValid;
}