  import assert from "assert"

const OBJECT = "[object Object]"
//const isNull = (a: unknown) => a === null
//const isUndef = (a: unknown) => a === undefined
const isStr = (a: unknown) : a is string => typeof a === 'string'
const isSym = (a: unknown) : a is symbol => typeof a === 'symbol'
//const isArray = Array.isArray
const isStruct = <T extends {}>(a: unknown) : a is T  => {
  if (a + "" === OBJECT) return true
  else return false
}
const isLiteral = (a: unknown) : a is boolean | string | number | undefined | null => {
  const t = typeof a
  if (t === 'string') return true
  if (t === 'number') return true
  if (t === 'boolean') return true
  if (t == null) return true
  return false
}

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
      if (isSym(key)) {
        if (key === PTR_KEY) return ref.id
        else if (key === DBG_KEY) return ref
        else throw new Error("No readable public symbol interface")
      } else {
        if (ref.stage.has(key)) {
          const staged = ref.stage.get(key) as any
          if (isLiteral(staged)) {
            return staged
          }
          const deref = ref.refMap.get(staged[PTR_KEY]) as any
          deref[DEREF_KEY] = `${path}/${key}`
          return deref
        }
        const srcVal = (source as any)[key]
        if (isLiteral(srcVal)) return srcVal
        if (isStruct(srcVal)) {
          const nextRefId = `${refCounter++}`
          const nextRef = proxyStructRef(refMap, patches, nextRefId, srcVal, `${path}/${key}`)
          ref.stage.set(key, { [PTR_KEY]: nextRefId })
          return nextRef
        }
        throw new Error(`Unhandled getter ${key}`)
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



/**
const proxyStruct = (refMap: Map<string, Ref>, patches: Array<JSONPatch>, ref: Ref, path = "") => {
  if (!isStruct(ref.source)) throw new Error
  if (!refMap.has(ref.id)) refMap.set(ref.id, ref)
  return new Proxy(ref.source as any, {
    get(source, key) : any {
      const isSymK = typeof key === 'symbol'
      if (isSymK) {
        if (key === REF_KEY) return ref
        else throw new Error('No publicly accessed symbol keys plz')
      } else {
        const stage = ref.stage
        if (stage.has(key)) {
          const staged = stage.get(key)
          if (isLiteral(staged)) return staged
          if (isStruct(staged)) {
            const refId = staged[REF_KEY]
            const ref = refMap.get(refId)
            if (!ref) throw new Error("No Ref")
            else return proxyStruct(refMap, patches, ref, path)
          }
        }
        const srcVal = source[key]
        if (isLiteral(srcVal)) return srcVal
        else if (isStruct(srcVal)) return proxyStruct(refMap, patches, createRef(srcVal), key)
        else throw new Error("Unhandled get")
      }
    },
    set(__, key, next, _) {
      if (isStr(key)) {
        const stage = ref.stage
        const keyPath = `${path}/${key}`
        if (stage.has(key)) {
          const stagedVal = stage.get(key)
          const stagedIsLit = isLiteral(stagedVal)
          const nextIsLit = isLiteral(next)
          if (stagedIsLit && nextIsLit) {
            stage.set(key, next)
            patches.push(replace(keyPath, next))
            return true
          }
          if (stagedIsLit && !nextIsLit) {
            const nextRef = createRef(next)
            stage.set(key, { [REF_KEY]: nextRef.id })
            if (isStruct(next)) proxyStruct(refMap, patches, nextRef, `${path}/${key}`)
            else throw new Error('Not allowing anything object writes right now')
            patches.push(replace(keyPath, next))
            return true
          }
          if (!stagedIsLit && nextIsLit) {
          }
        }
      }
      return true
    },
  })
}
**/
