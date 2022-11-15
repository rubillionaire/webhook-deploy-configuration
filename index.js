const {
  child,
  get,
  set,
} = require('firebase/database')

var defaultBranch = 'master';

module.exports = Deploys;
module.exports.utilities = {
	defaultBranch: function () {
		return defaultBranch;
	},
	nameForSiteBranch: nameForSiteBranch,
	fileForSiteBranch: fileForSiteBranch,
	siteNameForBucket: siteNameForBucket,
	bucketForSiteName: bucketForSiteName,
}


/**
 * Manage deploy configuration.
 * 
 * @param {object}  firebaseRootRef      Firebase Database ref
 */
function Deploys ( firebaseRootRef ) {
  if ( ! ( this instanceof Deploys ) ) return new Deploys( firebaseRootRef );

  var noDeployConfigurationError = new Error( 'No deploy configuration.' );
  var siteDoesNotExistError = new Error( 'Site does not exist in Firebase.' );

  const deploysKeyString = ({ siteName, key }) => {
  	return `buckets/${siteNameForBucket(siteName)}/${key}/dev/deploys`
  }

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
	 * @param  {string} siteName
	 * @param  {Function}
	 * @return {string} key
	 */
	async function getKeyForSite (siteName)  {
		const keyString = `management/sites/${siteNameForBucket(siteName)}/key`
		const keyChild = child(firebaseRootRef, keyString)
		try {
			const keySnapshot = await get(keyChild)
			return keySnapshot.val()
		} catch ( error ) {
			throw siteDoesNotExistError
		}
	}

	/**
	 * Returns the deploy configuration for a site, given
	 * its `siteName` and `key`.
	 * 
	 * @param  {string}    siteName
	 * @param  {string}    key
	 * @param  {Function}  callback
	 * @return {object} deployConfiguration
	 */
	async function getDeploysForSiteAndKey (siteName, key) {
		const keyString = deploysKeyString({ siteName, key })
		const keyChild = child(firebaseRootRef, keyString)
		try {
			const deployConfigurationSnapshot = await get(keyChild)
			const deployConfiguration = deployConfigurationSnapshot.val()
			if (areValidDeploys(firebaseConfiguration)) return deployConfiguration
			else return defaultConfiguration(siteName)
		}
		catch (error) {
			throw siteDoesNotExistError
		}
	}

	/**
	 * Get the deploy configuration in the firebase bucket tree.
	 * Having no configuration returns a default configuration.
	 *
	 * @param  {object}    opts          [description]
	 * @param  {string}    opts.siteName [description]
	 * @param  {string?}   opts.key      [description]
	 * @return {object}  { ...opts, deploys }
	 */
	async function getFirebaseConfiguration (opts={}) {
		if (!(isStringWithLength( opts.siteName ))) throw new Error( 'Requires site name.' )

		if (!opts.key) {
			opts.key = await getKeyForSite(opts.siteName)
		}

		const deploys = await getDeploysForSiteAndKey(opts.siteName, opts.key)
		return { ...opts, deploys }
	}

	/**
	 * Set the deploy configuration in the firebase bucket tree.
	 * 
	 * @param  {object}   opts
	 * @param  {string}   opts.siteName
	 * @param  {string}   opts.key
	 * @param  {array}   opts.deploys
	 * @param  {string}   opts.deploys[].bucket
	 * @param  {string}   opts.deploys[].branch
	 * @return {object}  { ...opts, deploys }
	 */
	async function setFirebaseConfiguration (opts) {
		if (!(areValidSetterOpts(opts))) throw new Error( 'Options for deploys.setter not valid.' )

		const { siteName, key } = opts
		const keyString = deploysKeyString({ siteName, key })
		const keyChild = child(firebaseRootRef, keyString)

		const deploys = bucketNamesForSiteNames(opts.deploys)
		await set(keyChild, deploys)

		return { ...opts, deploys }

		// local validation
		function areValidSetterOpts (opts) {
			var isValid = false;

			try {
				isValid = isStringWithLength(opts.siteName) &&
					isStringWithLength(opts.key) &&
					areValidDeploys(opts.deploys)
			} catch ( error ) {
				// continue
			}
			return isValid;
		}
	}
	/**
	 * @param {object}    opts
	 * @param {string}    opts.siteName  The site to set configuration for
	 * @param {string}    opts.key       The site key for authentication
	 * @param {object}    opts.deploy    The deploy configuration to use
	 * @param {string}    opts.deploy.bucket    The bucket to deploy to.
	 * @param {string}    opts.deploy.branch    The branch of templates to use in deploying.
	 */
	async function setBucketConfiguration (opts) {
		if (!( areValidBucketSetterOpts(opts))) throw new Error('Options for deploys.setter not valid.')

		const deploys = await getDeploysForSiteAndKey(opts.siteName, opts.key)

		const matchingDeployIndices = deploys
			.map(function configIndexForBranch (deploy, configIndex) {
				if (bucketForSiteName(deploy.bucket) === bucketForSiteName(opts.deploy.bucket)) return configIndex
				else return null
			})
			.filter(function isNumber (configIndex) {
				return typeof configIndex === 'number'
			})

		// defaults to adding to the end of the array
		var indexToUpdate = deploys.length;
		// defaults to an empty object
		var currentConfiguration = {};
		var configurationToSet = { ...opts.deploy }

		if (matchingDeployIndices.length === 1) {
			indexToUpdate = matchingDeployIndices[0];
			currentConfiguration = deploys[indexToUpdate];
		}

		deploys[indexToUpdate] = {
			...currentConfiguration,
			...configurationToSet,
		}

		await setFirebaseConfiguration({ ...opts, deploys })

		return {
			siteName: opts.siteName,
			key: opts.key,
			deploys,
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
	 * @return {undefined}
	 */
	async function removeBucketFirebaseConfiguration (opts) {
		var validatedOptions = areValidRemoveBucketOpts(opts)
		if (validatedOptions instanceof Error) throw validatedOptions

		var bucketDeployToRemove = bucketForSiteName(opts.bucket)

		const { siteName, key } = opts
		const keyString = deploysKeyString({ siteName, key })
		const keyChild = child(firebaseRootRef, keyString)

		const deploysSnapshot = await get(keyChild)
		let deploys = deploysSnapshot.val()
		if (Array.isArray(deploys)) {
      deploys = removeBucketDeploy(deploys)
      if (deploys) {
        await set(keyChild, deploys)
        return {
        	siteName: opts.siteName,
        	key: opts.siteKey,
        	deploys,
        }
      }
      else throw new Error('Could not remove bucket from deploys.')
    }
  	else throw new Error('Deploys not found.')

		/**
		 * @param  {object} deploys The current deploys for the site.
		 * @return {object|undefined} deploysToKeep The deploys after removing the specified bucket.
		 */
		function removeBucketDeploy ( deploys ) {
			
			let deploysToKeep = undefined

			try {
				deploysToKeep = deploys.filter( function ( deploy ) {
					return deploy.bucket !== bucketDeployToRemove;
				} )

				if ( deploysToKeep.length === ( deploys.length - 1 ) ) return deploysToKeep;

			} catch ( error ) {
				// continue
			}
			return deploysToKeep;
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
	 * @return {undefined}
	 */
	async function setDefaultFirebaseConfiguration (opts) {
		var validatedOptions = areValidDefaultBucketOpts( opts )
		if (validatedOptions instanceof Error) throw validatedOptions

		var deploys = defaultConfiguration(opts.siteName)

		const { siteName, key } = opts
		const keyString = deploysKeyString({ siteName, key })
		const keyChild = child(firebaseRootRef, keyString)

		await set(keyChild, deploys)
		return {
			siteName: opts.siteName,
			key: opts.key,
			deploys,
		}

		/**
		 * @param  {object?}     opts
		 * @param  {string?}     opts.siteName
		 * @param  {string?}     opts.key
		 * @return {true|Error}
		 */
		function areValidDefaultBucketOpts( opts ) {

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