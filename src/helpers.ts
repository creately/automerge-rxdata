import { Sakota } from '@creately/sakota';
import set from "lodash/set";
import unset from "lodash/unset";
import cloneDeep from "lodash/cloneDeep";

interface MongoModifier {
  $set?: Record<string, any>
  $unset?: Record<string, any>
}
export function automergePatchesToMongoModifier(
    patches: { action: string, path: string[], value?: any, values: any }[]): MongoModifier {
        const proxied = Sakota.create({} as any);
        const $unset = {} as any;
        patches.forEach(_patch => {
          const patch = cloneDeep( _patch ) as any;
          if ( patch.conflict && patch.value === undefined ) {
            return;
          }
          if ( patch.action === 'del' ) {
            const path = patch.path.join('.');
            $unset[path] = true;
          } else if ( patch.action === 'insert' ) {
            patch.path.pop();
            set( proxied, patch.path, patch.values );
          } else if ( patch.action === 'splice' ) {
            patch.path.pop();
            set( proxied, patch.path, patch.value );
          } else if ( patch.action === 'put' ) {
            set( proxied, patch.path, patch.value );
          }
        });
        const mod = proxied.__sakota__.getChanges();
        const flat = {} as any;
        if ( mod.$set ) {
            flat.$set = flatten( mod.$set );
        }
        if ( mod.$unset ) {
            flat.$unset = flatten( mod.$unset );
        }
        if ( Object.keys( $unset ).length ) {
            flat.$unset = { ...(flat.$unset || {}), ...$unset };
        }
        console.log( 'Flatten mod', flat, mod );
        return flat;
}

export function applyMongoModifier( doc: any,  modifier: MongoModifier ) {
    if ( modifier.$set )  {
        for ( const key in modifier.$set ) {
            set( doc, key, removeUndefined( modifier.$set[key]));
        }
    } 
    if ( modifier.$unset ) {
        for ( const key in modifier.$unset ) {
            unset( doc, key );
        }
    }
}

export function removeUndefined( obj: any ) {
    if (obj && typeof obj === 'object') {
      Object.keys(obj).forEach((key) => {
        if (obj[key] && typeof obj[key] === 'object') {
          // Recurse into nested objects
          removeUndefined(obj[key]);
        }
        // Delete property if it is undefined
        if (obj[key] === undefined) {
          delete obj[key];
        }
      });
    }
    return obj;
}

export function flatten(target: any, opts?: any) {
    opts = opts || {}
  
    const delimiter = opts.delimiter || '.';
    const maxDepth = opts.maxDepth
    const transformKey = opts.transformKey || keyIdentity;
    const output = {} as any;
  
    function step (object: any, prev?:any, currentDepth?:any) {
      currentDepth = currentDepth || 1
      Object.keys(object).forEach(function (key) {
        const value = object[key]
        const isarray = opts.safe && Array.isArray(value)
        const type = Object.prototype.toString.call(value)
        const isbuffer = isBuffer(value)
        const isobject = (
          type === '[object Object]'  // ||
        //   type === '[object Array]'
        )
  
        const newKey = prev
          ? prev + delimiter + transformKey(key)
          : transformKey(key)
  
        if (!isarray && !isbuffer && isobject && Object.keys(value).length &&
          (!opts.maxDepth || currentDepth < maxDepth)) {
          return step(value, newKey, currentDepth + 1)
        }
  
        output[newKey] = value
      })
    }
  
    step(target)
  
    return output
}

function isBuffer ( obj: any ) {
    return obj &&
      obj.constructor &&
      (typeof obj.constructor.isBuffer === 'function') &&
      obj.constructor.isBuffer(obj)
}

function keyIdentity ( key: any ) {
    return key
}
