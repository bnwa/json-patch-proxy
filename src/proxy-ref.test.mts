import t from 'tap'
import { RefMap } from './proxy-ref.mjs'
import { JSONPatch } from './proxy-ref.mjs'
import { proxyStructRef } from './proxy-ref.mjs'

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

