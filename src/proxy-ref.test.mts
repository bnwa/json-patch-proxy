import t from 'tap'
import { RefMap } from './proxy-ref.mjs'
import { JSONPatch } from './proxy-ref.mjs'
import { proxyStructRef } from './proxy-ref.mjs'
import { proxyArrayRef } from './proxy-ref.mjs'

t.test("Generates patches for root literal field mutation", t => {
  const obj = { a: 1, b: 2 }
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const p = proxyStructRef(refs, patches, `${100001}`, obj, "/")
  p.a = 2
  p.b = 3
  t.equal(patches.length, 2)
  t.equal(patches[0].op, 'replace')
  t.equal(patches[0].path, '//a')
  t.equal((patches[0] as any).value, 2)
  t.equal(patches[1].op, 'replace')
  t.equal(patches[1].path, '//b')
  t.equal((patches[1] as any).value, 3)
  t.equal(obj.a, 1)
  t.equal(obj.b, 2)
  t.end()
})

t.test("Generates patches for root literal and ref field mutation", t => {
  const root = {
    c: 1,
    d: "2",
    e: false,
    f: null,
    g: {
      h: 's',
      i: 'g'
    }
  }
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const p = proxyStructRef(refs, patches, `${100002}`, root, "$")

  p.c = 2
  p.d = "1"
  p.e = true
  p.g.h = "t"

  t.equal(patches.length, 4)
  t.equal(root.c , 1)
  t.equal(root.d , "2")
  t.equal(root.e , false)
  t.equal(root.g.h , 's')
  t.equal(patches[0].op, 'replace')
  t.equal(patches[0].path, '$/c')
  t.equal((patches[0] as any).value, 2)
  t.equal(patches[1].op, 'replace')
  t.equal(patches[1].path, '$/d')
  t.equal((patches[1] as any).value, "1")
  t.equal(patches[2].op, 'replace')
  t.equal(patches[2].path, '$/e')
  t.equal((patches[2] as any).value, true)
  t.equal(patches[3].op, 'replace')
  t.equal(patches[3].path, '$/g/h')
  t.equal((patches[3] as any).value, "t")
  t.end()
})

t.test("Overwrite ref fields" , t => {
  const root = {
    i: {
      j: 1,
      k: 2,
      l: 3
    }
  }
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const p = proxyStructRef(refs, patches, `${100003}`, root, "$")

  p.i = {
    j: 3,
    k: 2,
    l: 1
  }

  p.i.j = 4

  t.equal(patches.length, 2)
  t.equal(patches[0].op, "replace")
  t.equal(patches[0].path, "$/i")
  t.equal((patches[0] as any).value.j, 3)
  t.equal((patches[0] as any).value.k, 2)
  t.equal((patches[0] as any).value.l, 1)
  t.equal(patches[1].op, "replace")
  t.equal(patches[1].path, "$/i/j")
  t.equal((patches[1] as any).value, 4)
  t.end()
})

t.test("Can deref struct and still generate patches beneat root", t => {
  const root = {
    m: {
      n: 1,
      o: 2,
      p: 3
    }
  }
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const proxy = proxyStructRef(refs, patches, `${100004}`, root, "$")

  const child = proxy.m
  child.n = 3
  child.o = 2
  child.p = 1

  t.equal(patches.length, 3)
  t.equal(patches[0].op, "replace")
  t.equal(patches[0].path, "$/m/n")
  t.equal((patches[0] as any).value, 3)
  t.equal(patches[1].op, "replace")
  t.equal(patches[1].path, "$/m/o")
  t.equal((patches[1] as any).value, 2)
  t.equal(patches[2].op, "replace")
  t.equal(patches[2].path, "$/m/p")
  t.equal((patches[2] as any).value, 1)
  t.end()
})

t.test("Nested, nested mutation", t => {
  const root = {
    m: {
      n: 1,
      o: {
        q: 44
      },
      p: 3
    }
  }
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const proxy = proxyStructRef(refs, patches, `${100005}`, root, "$")

  const detached = proxy.m
  const next = { q: 22 }
  detached.o = next

  t.equal(patches.length, 1)
  t.equal(patches[0].op, "replace")
  t.equal(patches[0].path, "$/m/o")
  t.equal((patches[0] as any).value, next)
  t.end()
})

t.test("Top-level array of primitives field", t => {
  const root = [ 
    1,
    2,
    3,
    4,
    5,
    6,
    7,
    8,
    9,
    10,
  ]

  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const proxy = proxyArrayRef(refs, patches, `${100006}`, root, "$")

  proxy[0] = 11
  proxy[1] = 12

  t.equal(patches.length, 2)
  t.equal(patches[0].op, 'replace')
  t.equal(patches[0].path, '$/0')
  t.equal((patches[0] as any).value, 11)
  t.equal(patches[1].op, 'replace')
  t.equal(patches[1].path, '$/1')
  t.equal((patches[1] as any).value, 12)
  t.equal(root[0], 1)
  t.equal(root[1], 2)
  t.end()
})

t.test("Writing refs to array", t => {
  const root = [ 
    { a: 1 },
    [ 'a', 'b', 'c' ],
  ]

  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const proxy = proxyArrayRef(refs, patches, `${100007}`, root, "$")

  if (Array.isArray(proxy[0]) || Array.isArray(root[0])) {
    t.fail()
    t.end()
    return
  }
  if (!Array.isArray(proxy[1]) || !Array.isArray(root[1])) {
    t.fail()
    t.end()
    return
  }

  const obj = proxy[0]
  const arr = proxy[1]
  obj.a = 5
  arr[0] = 'c'
  arr[1] = 'b'
  arr[2] = 'a'
  const nextObj = { a: 10 }
  proxy[0] = nextObj
  const nextArr = [ 'd', 'e', 'f' ]
  proxy[1] = nextArr

  const f = proxy[1].pop()
  const e = proxy[1].pop()
  const d = proxy[1].pop()

  t.equal(patches.length, 9)

  t.equal(patches[0].op, 'replace')
  t.equal(patches[0].path, '$/0/a')
  t.equal((patches[0] as any).value, 5)

  t.equal(patches[1].op, 'replace')
  t.equal(patches[1].path, '$/1/0')
  t.equal((patches[1] as any).value, 'c')

  t.equal(patches[2].op, 'replace')
  t.equal(patches[2].path, '$/1/1')
  t.equal((patches[2] as any).value, 'b')

  t.equal(patches[3].op, 'replace')
  t.equal(patches[3].path, '$/1/2')
  t.equal((patches[3] as any).value, 'a')

  t.equal(patches[4].op, 'replace')
  t.equal(patches[4].path, '$/0')
  t.equal((patches[4] as any).value, nextObj)

  t.equal(patches[5].op, 'replace')
  t.equal(patches[5].path, '$/1')
  t.equal((patches[5] as any).value, nextArr)

  t.equal(root[0].a, 1)
  t.equal(root[1][0], 'a')
  t.equal(root[1][1], 'b')
  t.equal(root[1][2], 'c')

  t.equal(f, 'f')
  t.equal(e, 'e')
  t.equal(d, 'd')
  t.equal(proxy[1].length, 0)

  t.end()
})

t.test("Map proxied array", t => {
  const root = [
    { a: 1 },
    { a: 2 },
    { a: 3 },
    { a: 4 },
  ]
  const refs: RefMap = new Map
  const patches: Array<JSONPatch> = []
  const proxy = proxyArrayRef(refs, patches, `${100008}`, root, "$")

  const result = proxy.map(x => ({ b: x.a - 1 }))
  t.equal(result[0]?.b, 0)
  t.equal(result[1]?.b, 1)
  t.equal(result[2]?.b, 2)
  t.equal(result[3]?.b, 3)
  t.equal(result.length, 4)
  t.end()
})
