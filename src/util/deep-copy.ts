export default function deepCopy<T>(value: T): T {
  switch (typeof value) {
    case 'object': {
      if (Array.isArray(value)) {
        return value.map((item) => deepCopy(item)) as unknown as T;
      }

      // A plain (non-class, non-null) object.
      if (value != null && (value.constructor === Object || value.constructor == null)) {
        return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => {
          return [entryKey, deepCopy(entryValue)];
        })) as T;
      }

      // Null or a class instance.
      return value;
    }
    case 'bigint':
    case 'boolean':
    case 'function':
    case 'number':
    case 'string':
    case 'symbol':
    case 'undefined': {
      // Primitives and functions don't get copied.
      break;
    }
  }

  return value;
}
