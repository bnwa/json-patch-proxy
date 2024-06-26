const OBJECT = "[object Object]"
const isStr = (a: unknown) : a is string => typeof a === 'string'
const isSym = (a: unknown) : a is symbol => typeof a === 'symbol'
const isStruct = <T extends {}>(a: unknown) : a is T  => {
  if (a + "" === OBJECT) return true
  else return false
}
const isArr = <T extends any[]>(a: unknown) : a is T => {
  return Array.isArray(a)
}
const isFunc = (a: any) : a is Function => {
  return a instanceof Function
}
const isLiteral = (a: unknown) : a is boolean | string | number | undefined | null => {
  const t = typeof a
  if (t === 'string') return true
  if (t === 'number') return true
  if (t === 'boolean') return true
  if (t == null) return true
  return false
}
const isPtr = (a: any) : a is { [PTR_KEY]: string } =>
  isLiteral(a) || typeof a[PTR_KEY] == null ? true : false

const add = (path: string, value: unknown) => ({
  op: 'add',
  path,
  value
})
const remove = (path: string) => ({
  op: 'remove',
  path,
})
const replace = (path: string, value: unknown) => ({
  op: 'replace',
  path,
  value,
})

export type JSONPatch =
  | ReturnType<typeof add>
  | ReturnType<typeof remove>
  | ReturnType<typeof replace>

export type RefMap = Map<string,unknown>
type StageMap = Map<string, string | number | boolean | undefined | null | { [PTR_KEY]: string } >

const PTR_KEY = Symbol('ref')
const DEREF_KEY = Symbol('deref')
const DBG_KEY = Symbol('debug')

let refCounter = 0

type Ref = {
  id: string
  source: unknown
  patches: Array<JSONPatch>
  refMap: RefMap
  stage: StageMap
}

export const proxyStructRef = <T extends {}>(refMap: RefMap, patches: Array<JSONPatch>, refId: string, source: T, initPath = "") : T => {
  let path = initPath

  const ref: Ref = {
    id: refId,
    source,
    refMap,
    patches,
    stage: new Map
  }

  const handler: ProxyHandler<T> = {
    get(source, key, _) {
      const { id } = ref
      const { stage } = ref
      const { refMap } = ref
      const { patches } = ref
      if (isSym(key)) {
        if (key === PTR_KEY) return id
        else if (key === DBG_KEY) return ref
        else throw new Error("No readable public symbol interface")
      } else {
        if (stage.has(key)) {
          const staged = stage.get(key) as any
          if (isLiteral(staged)) {
            return staged
          } else {
            const deref = refMap.get(staged[PTR_KEY]) as any
            deref[DEREF_KEY] = `${path}/${key}`
            return deref
          }
        } else {
          const srcVal = (source as any)[key]
          if (isLiteral(srcVal)) {
            return srcVal
          } else if (isStruct(srcVal)) {
            const nextRefId = `${refCounter++}`
            const nextRef = proxyStructRef(refMap, patches, nextRefId, srcVal, `${path}/${key}`)
            stage.set(key, { [PTR_KEY]: nextRefId })
            return nextRef
          } else {
            throw new Error(`Unhandled getter ${key}`)
          }
        }
      }
    },
    set(_, key, next, __) {
      if (isSym(key)) {
        if (key === DEREF_KEY && isStr(next)) {
          path = next
        } else {
          throw new Error('No public symbol interface')
        }
      } else {
        if (ref.stage.has(key)) {
          const staged = ref.stage.get(key)
          const nextIsLit = isLiteral(next)
          const stagedIsLit = isLiteral(staged)
          if (nextIsLit && stagedIsLit) {
            ref.stage.set(key, next)
            if (path) patches.push(replace(`${path}/${key}`, next))
            else throw new Error("NO PATH")
          } else if (nextIsLit && !stagedIsLit) {
            const stagedRefId = staged[PTR_KEY]
            const stagedRef = refMap.get(stagedRefId) as any
            stagedRef[DEREF_KEY] = ""
            ref.stage.set(key, next)
            if (path) ref.patches.push(replace(`${path}/${key}`, next))
            else throw new Error("No Path")
          } else if (!nextIsLit && stagedIsLit) {
              if (isStruct(next)) {
                let nextRefId: string | undefined = (next as any)[PTR_KEY]
                if (nextRefId == null) {
                  nextRefId = `${refCounter++}`
                  proxyStructRef(refMap, patches, nextRefId, next, `${path}/${key}`)
                }
                ref.stage.set(key, {[PTR_KEY]: nextRefId})
                if (path) ref.patches.push(replace(`${path}/${key}`, next))
              } else {
                throw new Error("Not writing arrays right now")
              }
          } else {
              if (isStruct(next)) {
                const stagedIsRef = typeof (staged as any)[PTR_KEY] === 'string'
                let nextRefId: string | undefined = (next as any)[PTR_KEY]
                if (nextRefId == null) {
                  nextRefId = `${refCounter++}`
                  proxyStructRef(refMap, patches, nextRefId, next, `${path}/${key}`)
                }
                if (stagedIsRef) {
                  (staged as any)[DEREF_KEY] = ""
                }
                ref.stage.set(key, {[PTR_KEY]: nextRefId})
                if (path) ref.patches.push(replace(`${path}/${key}`, next))
                else throw new Error("NO PATH")
              } else {
                throw new Error("Not writing arrays right now")
              }
          }
        } else {// Now we just need to know whether next is a proxied ref or not
          const src = ref.source as any
          const isOwnKey = key in src
          if (isLiteral(next)) {
            ref.stage.set(key, next)
            if (path) {
              if (isOwnKey) ref.patches.push(replace(`${path}/${key}`, next))
              else ref.patches.push(add(`${path}/${key}`, next))
            } else {
              throw new Error("NO PATH")
            }
          } else {
            if (isStruct(next)) {
              let nextRefId: string | undefined = (next as any)[PTR_KEY]
              if (nextRefId == null) {
                nextRefId = `${refCounter++}`
                proxyStructRef(refMap, patches, nextRefId, next, `${path}/${key}`)
              }
              ref.stage.set(key, {[PTR_KEY]: nextRefId})
              if (path) {
                if (isOwnKey) ref.patches.push(replace(`${path}/${key}`, next))
                else ref.patches.push(add(`${path}/${key}`, next))
              } else {
                throw new Error("NO PATH")
              }
            } else {
              throw new Error("Not writing arrays right now")
            }
          }
        }
      }
      return true
    }
  }

  const proxyRef = new Proxy(source, handler)
  refMap.set(ref.id, proxyRef)
  return proxyRef
}

export const proxyArrayRef = <T extends any[]>(refMap: RefMap, patches: Array<JSONPatch>, refId: string, source: T, initPath = "") : T => {
  let path = initPath
  let len = source.length

  const ref: Ref = {
    id: refId,
    source,
    refMap,
    patches,
    stage: new Map
  }

  const methods = {
    push(next: unknown) {
      const { stage } = ref
      const { patches } = ref
      const { refMap } = ref
      const { size: len } = stage
      const keyPath = `${path}/${len}`
      if (isLiteral(next)) {
        stage.set(`${len}`, next)
        patches.push(add(`${path}/-`, next))
      // TODO consolidate logic for struct writes
      } else if (isStruct(next)) {
        // TODO consider only instantiating ref proxies
        // on read
        let nextRefId: string | undefined = (next as any)[PTR_KEY]
        if (nextRefId == null) {
          nextRefId = `${refCounter++}`
          proxyStructRef(refMap, patches, nextRefId, next, keyPath)
        }
        ref.stage.set(keyPath, {[PTR_KEY]: nextRefId})
      }  else if (isArr(next)) {
        // TODO when array methods populated
      }
      return len + 1
    },
    pop() {
      let result: any
      const { stage } = ref
      const { source } = ref
      const { patches } = ref
      const { refMap } = ref
      const tail = len - 1
      const key = `${tail}`
      const srcLen = (source as any[]).length
      if (len === 0) return undefined
      if (stage.has(key)) {
        let staged = stage.get(key) as any
        if (isPtr(staged)) {
          const refId = staged[PTR_KEY]
          result = refMap.get(refId)
          result[DEREF_KEY] = ""
        } else {
          result = staged
        }
        stage.delete(key)
      } else {
        if (srcLen < len) throw new Error(`INVARIANT ->
          array stage should possess key value when source array
          length is shorter than stage size`)
        const srcVal = (source as any)[tail]
        const srcIsLit = isLiteral(srcVal)
        const srcIsArr = isArr(srcVal)
        const srcIsStrc = isStruct(srcVal)
        if (!srcIsLit && !srcIsStrc && !srcIsArr) throw new Error(`
          INVARIANT -> Only JSON types accepted as proxied values; check path
          at ${path}`)
        if (isLiteral(srcVal)) {
          result = srcVal
        } else {
          const newRefId = `${refCounter++}`
          if (srcIsStrc) result = proxyStructRef(refMap, patches, newRefId, srcVal, '')
          else result = proxyArrayRef(refMap, patches, newRefId, srcVal, ``)
        }
      }
      --len
      if (path) patches.push(remove(`${path}/-`))
      return result
    },
    map<T>(f: (x: unknown) => T) : Array<T> {
      const { id } = ref
      const proxiedArr = refMap.get(id) as Array<unknown>
      const transform: Array<T> = []
       for(let i = 0, x: unknown; i < len; i++) {
        x = proxiedArr[i]
        transform.push(f(x))
      }
      return transform
    },
    filter<T>(f: (x: T) => boolean) : Array<T> {
      const { id } = ref
      const proxiedArr = refMap.get(id) as Array<unknown>
      const transform: Array<T> = []
       for(let i = 0, x: unknown; i < len; i++) {
        x = proxiedArr[i]
        if (f(x as T)) transform.push(x as T)
      }
      return transform
    },
    reduce<T>(f: (a: T, x: unknown) => T, a: T) : T {
      const { id } = ref
      const proxiedArr = refMap.get(id) as Array<unknown>
       for(let i = 0, x: unknown; i < len; i++) {
        x = proxiedArr[i]
        a = f(a, x)
      }
      return a
    },
    sort<T extends unknown>(f: (a: T, b: T) => number) : Array<T> {
      const { id } = ref
      const arr = refMap.get(id) as Array<T>
      const sorted: Array<T> = [...arr]
      sorted.sort(f)
      return sorted
    },
  }

  const iterate = function() {
    let i = -1
    return {
      next() {
        const arr = refMap.get(refId) as Array<unknown>
        if(++i < len) {
          const value = arr[i]
          const result = { done: false, value }
          return result
        } else {
          return { done: true }
        }
      },
      [Symbol.iterator]() { return this },
    }
  }

  const handler: ProxyHandler<T> = {
    get(source, key, _) {
      const { id } = ref
      const { stage } = ref
      const { refMap } = ref
      const { patches } = ref
      if (isSym(key)) {
        if (key === PTR_KEY) return id
        else if (key === DBG_KEY) return ref
        else if (key === Symbol.iterator) return iterate
        else throw new Error(`No readable public symbol interface when symbol is ${key.toString()}`)
      }
      if (stage.has(key)) {
        const staged = stage.get(key) as any
        if (isLiteral(staged)) {
          return staged
        } else {
          const deref = refMap.get(staged[PTR_KEY]) as any
          deref[DEREF_KEY] = `${path}/${key}`
          return deref
        }
      }
      if (key === 'length') return len
      if (key === 'push') return methods.push
      if (key === 'pop') return methods.pop
      if (key === 'map') return methods.map
      if (key === 'filter') return methods.filter
      if (key === 'reduce') return methods.reduce
      if (key === 'sort') return methods.sort
      const srcVal = (source as any)[key]
      const srcIsLit = isLiteral(srcVal)
      const srcIsArr = isArr(srcVal)
      const srcIsStrc = isStruct(srcVal)
      const srcIsFunc = isFunc(srcVal)
      if (srcIsFunc) {
        throw new Error(`PANIC -> Encountered unhandled Array method`)
      }
      if (srcIsLit) {
        return srcVal
      }
      if (srcIsStrc || srcIsArr) {
        const nextRefId = `${refCounter++}`
        stage.set(key, { [PTR_KEY]: nextRefId })
        if (isStruct(srcVal)) return proxyStructRef(refMap, patches, nextRefId, srcVal, `${path}/${key}`)
        else return proxyArrayRef(refMap, patches, nextRefId, srcVal, `${path}/${key}`)
      }
      throw new Error(`
        INVARIANT -> Attempted to deref a prohibited type on proxied array for key '${key}'`)
    },
    set(_, key, next, __) {
      if (isSym(key)) {
        if (key === DEREF_KEY && isStr(next))  path = next
        else throw new Error('No public symbol interface')
        return true
      }
      const { stage } = ref
      const { refMap } = ref
      const { source } = ref
      const { patches } = ref
      const nextIsLit = isLiteral(next)
      const nextIsStrc = isStruct(next)
      const nextIsArr = isArr(next)
      const idx = parseInt(key, 10)
      const srcLn = (source as any[]).length
      if (Number.isNaN(idx)) throw new Error(`
        INVARIANT -> Arbitrary string key writes prohibited on proxied arrays`)
      if ((idx > len - 1) || (len < srcLn))  throw new Error(`
        INVARIANT -> Writing beyond current proxied array length is prohbited`)
      if (!nextIsStrc && !nextIsArr && !nextIsLit) throw new Error(`
        INVARIANT -> Writing a type that is neither a primtive, array, or
        object literal is prohibited`)
      if (ref.stage.has(key)) {
        const staged = stage.get(key)
        if (isPtr(staged)) {
          const stagedRefId = staged[PTR_KEY]
          const deref = refMap.get(stagedRefId) as any
          deref[DEREF_KEY] = ""
        }
      }
      if (nextIsArr || nextIsStrc) {
        let nextRefId: string | undefined = (next as any)[PTR_KEY]
        if (nextRefId == null) {
          nextRefId = `${refCounter++}`
          if (nextIsStrc) proxyStructRef(refMap, patches, nextRefId, next, `${path}/${key}`)
          else if (nextIsArr) proxyArrayRef(refMap, patches, nextRefId, next, `${path}/${key}`)
        }
        stage.set(key, {[PTR_KEY]: nextRefId})
      } else {
        stage.set(key, next)
      }
      if (path) patches.push(replace(`${path}/${key}`, next))
      return true
    }
  }

  const proxyRef = new Proxy(source, handler)
  refMap.set(ref.id, proxyRef)
  return proxyRef

}
