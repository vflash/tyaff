# Tyaff — Documentation

A lightweight VDOM library for JavaScript with a philosophy of minimalism.

## Table of Contents

- [Installation](#installation)
- [Quick Start](#quick-start)
- [Components](#components)
- [Props and children](#props-and-children)
- [State and updates](#state-and-updates)
- [Lifecycle](#lifecycle)
- [memo() optimization](#memo-optimization)
- [Context](#context)
- [Refs](#refs)
- [Portals](#portals)
- [Keys](#keys)
- [Attributes and events](#attributes-and-events)
- [Forms](#forms)
- [refresh() and global store](#refresh-and-global-store)
- [Production mode](#production-mode)
- [Known limitations](#known-limitations)

---

## Installation

```bash
npm install tyaff
```

```javascript
import { h, Component, mount, refresh } from 'tyaff';
```

---

## Quick Start

```javascript
import { h, Component, mount } from 'tyaff';

const Hello = Component({
    render() {
        return h('h1', null, 'Hello, World!');
    }
});

mount(Hello, document.getElementById('app'));
```

**With a stateful component:**

```javascript
const Counter = Component({
    count: 0,

    increment() {
        this.update({ count: this.count + 1 });
    },

    render() {
        return h('div', null,
            h('p', null, 'Counter: ' + this.count),
            h('button', { onClick: this.increment }, '+')
        );
    }
});

mount(Counter, document.getElementById('app'));
```

---

## Components

Components are created via the factory `Component(definition)`:

```javascript
const MyComponent = Component({
    // Initial state values
    count: 0,
    items: [],

    // Custom methods (automatically bound to instance)
    increment() { this.count++; this.update(); },

    // Lifecycle methods
    init() { /* initialization */ },
    onMounted() { /* after DOM insertion */ },
    onUpdated() { /* after update */ },
    onUnmounted() { /* before removal */ },

    // Required method
    render() {
        return h('div', null, 'Content');
    }
});
```

**Important:**
- No separate "state" concept — all variables are instance properties
- Methods are automatically bound to `this`
- Lifecycle methods не привязываются автоматически

---

## Props and children

### Props as first argument

All key functions receive `this.props` as the first argument:

```javascript
const Card = Component({
    render({ title, text }) {
        return h('div', { className: 'card' },
            h('h2', null, title),
            h('p', null, text)
        );
    }
});

// Usage
h(Card, { title: 'Title', text: 'Card text' })
```

### Props normalization

Optional `props()` function allows transforming incoming data:

```javascript
const Button = Component({
    props(incoming) {
        return {
            label: incoming.label || 'Click me',
            type: incoming.type || 'button',
            disabled: Boolean(incoming.disabled)
        };
    },

    render({ label, type, disabled }) {
        return h('button', { type, disabled }, label);
    }
});
```

### Children

Children are passed as `children` in props:

```javascript
const Container = Component({
    render({ title, children }) {
        return h('div', { className: 'container' },
            h('h1', null, title),
            h('div', { className: 'content' }, children)
        );
    }
});

// Usage
h(Container, { title: 'My container' },
    h('p', null, 'Paragraph 1'),
    h('p', null, 'Paragraph 2')
)
```

---

## State and updates

### Direct mutation

All variables are mutable properties on the instance:

```javascript
const Counter = Component({
    count: 0,
    items: [],

    add() {
        this.items.push('New element');  // direct mutation
        this.count++;
        this.update();  // notify about changes
    }
});
```

### update()

```javascript
// Forced update
this.update();

// With patch
this.update({ count: this.count + 1 });

// Returns Promise<boolean>
const changed = await this.update({ count: 10 });
if (changed) {
    console.log('Data has changed');
}
```

**After `await update()` the view is guaranteed to be up-to-date.**

### rules update()

| Call | Returns |
|-------|-----------|
| `update()` | `true` (forced render) |
| `update({})` | `false` (empty patch) |
| `update(patch)` with changes | `true` |
| `update(patch)` without changes | `false` |

---

## Lifecycle

### Call order on first mount

1. `props(incoming)` — props normalization
2. `init(props)` — initialization state
3. `memo(props)` — dependency computation
4. `render(props)` — VDOM creation
5. `onMounted()` — after DOM insertion

### Call order on update

1. `props(incoming)` — props update
2. `memo(props)` — dependency check
3. `render(props)` — VDOM creation (only if memo allowed)
4. `onUpdated()` — after update DOM

### Access to this

All key methods have access to the instance:

```javascript
Component({
    props(incoming) { /* this is available */ },
    init(props) { /* this is available */ },
    memo(props) { /* this is available */ },
    render(props) { /* this is available */ }
});
```

### Lifecycle example

```javascript
const Timer = Component({
    count: 0,
    intervalId: null,

    init() {
        this.intervalId = setInterval(() => {
            this.update({ count: this.count + 1 });
        }, 1000);
    },

    onMounted() {
        console.log('Component mounted');
    },

    onUnmounted() {
        clearInterval(this.intervalId);
    },

    render() {
        return h('div', null, 'Timer: ' + this.count);
    }
});
```

---

## memo() optimization

`memo()` blocks render only for the current component. Children always go through their own update chain.

### Basic usage

```javascript
const ExpensiveList = Component({
    memo(props) {
        // render will only execute when items changes
        return [props.items.length];
    },

    render({ items }) {
        return h('ul', null,
            items.map(item => h('li', { key: item.id }, item.text))
        );
    }
});
```

### With internal state

```javascript
const Counter = Component({
    count: 0,

    memo(props) {
        // Dependencies from props and state
        return [props.value, this.count];
    },

    render(props) {
        return h('div', null, props.value, this.count);
    }
});
```

### With context

If a component reads context and uses memo, include context in dependencies:

```javascript
const ThemedCard = Component({
    memo(props) {
        return [props.title, this.context('theme')];
    },

    render(props) {
        return h('div', { className: this.context('theme') }, props.title);
    }
});
```

### Важно

`memo()` blocks render **only for the current component**. Children always go through their own `props → memo → render`, even if the parent is protected by memo().

---

## Context

Pull-based context without Provider/Consumer.

### Creating a provider

```javascript
const ThemeProvider = Component({
    theme: 'light',

    context: {
        theme() { return this.theme; },
        toggleTheme() {
            this.theme = this.theme === 'light' ? 'dark' : 'light';
            this.update();
        }
    },

    render() {
        return h('div', null, this.props.children);
    }
});
```

### Usage context

```javascript
const ThemedButton = Component({
    render() {
        const theme = this.context('theme');
        return h('button', { className: 'btn-' + theme }, 'Button');
    }
});

// Mounting
mount(
    h(ThemeProvider, null,
        h(ThemedButton)
    ),
    document.body
);
```

### Methods

- `this.context(key)` — get value from parent
- `this.contextSelf(key)` — get value from self or parent

### Context override

A child component can override context:

```javascript
const Page = Component({
    context: {
        lang() { return this.props.lang || this.context('lang'); }
    },

    render() {
        return h('div', null, this.props.children);
    }
});
```

---

## Refs

`this.refs` — both a function and an object.

### Usage

```javascript
const InputFocus = Component({
    onMounted() {
        this.refs.input.focus();
    },

    render() {
        return h('div', null,
            h('input', { ref: this.refs('input'), type: 'text' }),
            h('button', { onClick: () => this.refs.input.select() }, 'Select')
        );
    }
});
```

### Ref to component

```javascript
const Parent = Component({
    onMounted() {
        this.refs.child.someMethod();
    },

    render() {
        return h(Child, { ref: this.refs('child') });
    }
});
```

### Ref lifecycle

- **Mount:** `ref(node/instance)` is called
- **Unmount:** `ref(null)` is called
- **Update:** для HTML — is called снова; для компонентов — не is called

---

## Portals

Mounting в произвольный DOM-контейнер.

```javascript
const Modal = Component({
    render() {
        if (!this.props.visible) return null;

        return createPortal(
            h('div', { className: 'modal' },
                h('h2', null, this.props.title),
                h('button', { onClick: this.props.onClose }, 'Close')
            ),
            () => document.getElementById('modal-root')
        );
    }
});

// HTML
// <div id="app"></div>
// <div id="modal-root"></div>
```

### Deferred mounting

If the container doesn't exist yet, the portal waits:

```javascript
createPortal(
    children,
    () => document.querySelector('.dynamic-container')  // may return null
)
```

---

## Keys

### Difference from React

In React, a key is unique among siblings. In tyaff — **among all elements in render**.

This allows moving elements between different parents while preserving instance and state.

### Two types of keys

**User key** (element with `key` prop):
```javascript
h(Component, { key: 'fio' }, ...)  // identifier: #fio
```

**Automatic key** (element without `key` prop):
- Formed based on position in the tree
- Element is recreated when order changes

### Examples

```javascript
// List with keys
h('ul', null,
    items.map(item =>
        h('li', { key: item.id }, item.text)
    )
)

// Moving between parents
h('div', null,
    h(Component, { key: 'card' }, ...)  // can be moved
)
```

### Fragment with key

Fragment with key allows moving groups of children:

```javascript
h(Fragment, { key: 'group-a' },
    h(Item, { key: 'i1' }),
    h(Item, { key: 'i2' })
)
```

---

## Attributes and events

### HTML attributes (camelCase → lowercase)

```javascript
h('div', {
    className: 'box',      // → class="box"
    htmlFor: 'input',      // → for="input"
    tabIndex: 0            // → tabindex="0"
})
```

### Events

```javascript
h('button', {
    onClick: (e) => console.log(e),
    onChange: this.handleChange
})
```

### Style

```javascript
h('div', {
    style: { fontSize: '16px', backgroundColor: 'red' }
})
```

### dangerouslySetInnerHTML

```javascript
h('div', {
    dangerouslySetInnerHTML: { __html: '<b>Bold</b>' }
})
```

### SVG

```javascript
h('svg', {
    viewBox: '0 0 24 24',
    width: 24,
    height: 24
},
    h('path', { d: 'M12 2L2 22h20L12 2z' })
)
```

---

## Forms

### Controlled fields

Use DOM properties, not attributes:

```javascript
const Form = Component({
    formData: { name: '', email: '' },

    handleChange(field, value) {
        this.update({
            formData: { ...this.formData, [field]: value }
        });
    },

    render() {
        return h('form', null,
            h('input', {
                type: 'text',
                value: this.formData.name,
                onChange: (e) => this.handleChange('name', e.target.value)
            }),
            h('input', {
                type: 'email',
                value: this.formData.email,
                onChange: (e) => this.handleChange('email', e.target.value)
            })
        );
    }
});
```

### Select multiple

```javascript
h('select', {
    multiple: true,
    value: this.selected,  // массив
    onChange: (e) => {
        const values = Array.from(e.target.selectedOptions, opt => opt.value);
        this.update({ selected: values });
    }
},
    options.map(opt => h('option', { value: opt }, opt))
)
```

---

## refresh() and global store

### refresh()

Global update of all mounted trees:

```javascript
const time = await refresh();  // time in milliseconds
console.log(`Render: ${time.toFixed(2)}ms`);
```

### Global Store Pattern

Components can read data from a global store:

```javascript
// store.js
export const store = { count: 0, user: null };

// App.js
import { store } from './store.js';
import { refresh } from 'tyaff';

const Counter = Component({
    render() {
        return h('div', null, 'Count: ', store.count);
    }
});

// Update
store.count = 55;
await refresh();  // all components will reread the store
```

---

## Production mode

### setDevMode()

Switching between development and production:

```javascript
import { setDevMode } from 'tyaff';

if (process.env.NODE_ENV === 'production') {
    setDevMode(false);
}
```

**Development mode (default):**
- Duplicate key checking
- Component error isolation
- Detailed messages

**Production mode:**
- Disabling checks
- Maximum performance

**Important:** In production, errors in components can break the entire update batch.

---

## Known limitations

### Conditional rendering

Используйте `&&` внутри обёртки:

```javascript
// ✅ Correct
render() {
    return h('div', null,
        this.show && h('span', null, 'content')
    );
}

// ❌ Not recommended
render() {
    return this.show ? h('div', null, 'text') : null;
}
```

### Large lists (>10K elements)

Use virtualization (render only visible elements).

### Getters

Getters из definition не копируются на instance. Используйте методы или вычисляйте в `render()`.

---

## API Reference

### Exported functions

```javascript
export {
    h,              // VDOM node creation
    Component,      // Component factory
    createPortal,   // Portal creation
    Fragment,       // Fragment symbol
    mount,          // Mount to DOM
    refresh,        // Update всех компонентов
    setDevMode      // Switch dev/production mode
};
```

### h(type, props, ...children)

VDOM node creation.

### Component(definition)

Factory for creating components.

### mount(input, container)

Universal function for mount, update, and unmount.

### refresh()

Global asynchronous update.

### setDevMode(isDev)

Switch development mode.

