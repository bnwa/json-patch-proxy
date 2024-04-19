# JSON Patch Proxy
**WIP** This library will expose a function that accepts an object and a
callback that also accepts that object type and returns `void`. Within the
scope of this callback, any mutation to the object will generate a JSON Patch
which is added to a list of such and returned to the consumer when the callback
scope returns. The originally provided object and all references created within
the callback scope are not altered, but proxied.

This is very similar to the [Immer](https://github.com/immerjs/immer) library's
`produceWithPatches` function except here we do not return an immutable
generation of the provided object, just the list of patches to get from state A
to state B. Additionally, Immer does not support a number of expected access
patterns, e.g. dereffing objects and mutating them outside the initial object
tree; this library does the right thing with detached references.

```typescript
import { generatePatches } from 'json-patch-proxy'
import t from 'tap'

const root = {
  i: {
    j: 1,
    k: 2,
    l: 3,
  }
}

const patches = generatePatches(root, proxy => {
    p.i = {
        j: 3,
        k: 2,
        l: 1
    }
    p.i.j = 4
})

t.equal(patches.length, 2)
t.equal(patches[0].op, "replace")
t.equal(patches[0].path, "/i")
t.equal(patches[0].value.j, 3)
t.equal(patches[0].value.k, 2)
t.equal(patches[0].value.l, 1)
t.equal(patches[1].op, "replace")
t.equal(patches[1].path, "/i/j")
t.equal(patches[1].value, 4)
t.end()
```
