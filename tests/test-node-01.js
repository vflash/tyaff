// ============================================================================
// Node.js тесты для VDOM библиотеки tyaff — Часть 1: базовые механизмы
// Запуск: node --test tests/test-node-01.js
// ============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

let hasDOM = false;
try {
    const happyDom = await import('happy-dom');
    const window = new happyDom.Window({ url: 'http://localhost' });
    global.window = window;
    global.document = window.document;
    global.HTMLElement = window.HTMLElement;
    global.Node = window.Node;
    global.Text = window.Text;
    global.SVGElement = window.SVGElement;
    global.performance = window.performance;
    hasDOM = true;
} catch (e) {
    console.warn('⚠️  happy-dom не установлен. DOM-тесты будут пропущены.');
}

const { h, Component, Fragment, createPortal, mount, refresh } = await import('../src/core.js');

function createContainer() {
    if (!hasDOM) throw new Error('DOM недоступен');
    return document.createElement('div');
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// ============================================================================
// PURE ТЕСТЫ (без DOM)
// ============================================================================

describe('h() — JSX runtime', () => {
    test('создаёт vnode с tag, props, childs', () => {
        const vnode = h('div', { id: 'test' }, 'hello');
        assert.equal(vnode.tag, 'div');
        assert.deepEqual(vnode.props, { id: 'test' });
        assert.equal(vnode.childs.length, 1);
    });

    test('нормализует null/false/true в null', () => {
        const vnode = h('div', null, null, false, true, 'ok');
        assert.equal(vnode.childs[0], null);
        assert.equal(vnode.childs[1], null);
        assert.equal(vnode.childs[2], null);
        assert.deepEqual(vnode.childs[3], { _text: 'ok' });
    });

    test('оборачивает строки/числа в _text', () => {
        const vnode = h('div', null, 'text', 42);
        assert.deepEqual(vnode.childs[0], { _text: 'text' });
        assert.deepEqual(vnode.childs[1], { _text: '42' });
    });

    test('сохраняет массивы как массивы (не flat)', () => {
        const arr = [h('span'), h('span')];
        const vnode = h('div', null, arr);
        assert.ok(Array.isArray(vnode.childs[0]));
        assert.equal(vnode.childs[0].length, 2);
    });

    test('props.children имеет приоритет над childs', () => {
        const vnode = h('div', { children: 'from-props' }, 'from-childs');
        assert.equal(vnode.props.children, 'from-props');
    });

    test('props по умолчанию пустой объект', () => {
        const vnode = h('div');
        assert.deepEqual(vnode.props, {});
    });

    test('поддерживает компоненты как tag', () => {
        const MyComp = Component({ render() { return h('div'); } });
        const vnode = h(MyComp, { value: 5 });
        assert.equal(vnode.tag, MyComp);
        assert.equal(vnode.props.value, 5);
    });
});

describe('Component() — фабрика', () => {
    test('возвращает конструктор с _definition', () => {
        const MyComp = Component({
            name: 'Test',
            render() { return h('div'); }
        });
        assert.ok(MyComp._definition);
        assert.equal(MyComp._definition.name, 'Test');
    });

    test('создаёт instance с _definition', () => {
        const MyComp = Component({
            value: 42,
            render() { return h('div'); }
        });
        const inst = new MyComp();
        assert.equal(inst._definition, MyComp._definition);
        assert.equal(inst.value, 42);
    });

    test('не копирует context как поле', () => {
        const MyComp = Component({
            context: { lang() { return 'ru'; } },
            render() { return h('div'); }
        });
        const inst = new MyComp();
        assert.equal(inst.context, undefined);
    });
});

describe('Fragment и Portal (pure)', () => {
    test('Fragment это Symbol', () => {
        assert.equal(typeof Fragment, 'symbol');
    });

    test('createPortal создаёт Portal vnode', () => {
        const portal = createPortal(h('div'), () => null);
        assert.equal(typeof portal.tag, 'symbol');
        assert.ok(portal.props.containerGetter);
    });

    test('createPortal оборачивает один child в массив', () => {
        const child = h('div');
        const portal = createPortal(child, () => null);
        assert.ok(Array.isArray(portal.childs));
        assert.equal(portal.childs[0], child);
    });
});

// ============================================================================
// DOM ТЕСТЫ
// ============================================================================

if (hasDOM) {
    describe('mount() — базовое монтирование', () => {
        test('монтирует простой HTML', () => {
            const container = createContainer();
            mount(h('div', { id: 'root' }, 'hello'), container);
            assert.equal(container.firstChild.tagName, 'DIV');
            assert.equal(container.firstChild.id, 'root');
            assert.equal(container.firstChild.textContent, 'hello');
        });

        test('монтирует компонент с init/render', () => {
            const container = createContainer();
            const MyComp = Component({
                count: 0,
                init() { this.count = 10; },
                render() { return h('div', null, 'Count: ', this.count); }
            });
            mount(MyComp, container);
            assert.equal(container.textContent, 'Count: 10');
        });

        test('принимает конструктор компонента без обёртки h()', () => {
            const container = createContainer();
            const MyComp = Component({
                render() { return h('span', null, 'works'); }
            });
            mount(MyComp, container);
            assert.equal(container.textContent, 'works');
        });

        test('принимает массив как Fragment', () => {
            const container = createContainer();
            mount([h('span', null, 'a'), h('span', null, 'b')], container);
            assert.equal(container.querySelectorAll('span').length, 2);
        });

        test('принимает строку как текстовый узел', () => {
            const container = createContainer();
            mount('plain text', container);
            assert.equal(container.textContent, 'plain text');
        });
    });

    describe('mount() — edge cases', () => {
        test('mount(null) на пустой контейнер — ничего не делает', () => {
            const container = createContainer();
            mount(null, container);
            assert.equal(container.childNodes.length, 0);
        });

        test('mount дважды с разными конструкторами — заменяет', () => {
            const container = createContainer();
            const A = Component({ render() { return h('div', null, 'A'); } });
            const B = Component({ render() { return h('div', null, 'B'); } });
            mount(A, container);
            assert.equal(container.textContent, 'A');
            mount(B, container);
            assert.equal(container.textContent, 'B');
        });
    });

    describe('props() и init() — порядок вызова', () => {
        test('props первым аргументом в init', () => {
            const container = createContainer();
            let receivedProps = null;
            const MyComp = Component({
                init(props) { receivedProps = props; },
                render() { return h('div'); }
            });
            mount(h(MyComp, { value: 42 }), container);
            assert.ok(receivedProps);
            assert.equal(receivedProps.value, 42);
        });

        test('props первым аргументом в render', () => {
            const container = createContainer();
            let receivedProps = null;
            const MyComp = Component({
                render(props) {
                    receivedProps = props;
                    return h('div');
                }
            });
            mount(h(MyComp, { x: 1 }), container);
            assert.equal(receivedProps.x, 1);
        });

        test('init() вызывается только при первом mount', () => {
            const container = createContainer();
            let initCount = 0;
            const MyComp = Component({
                init() { initCount++; },
                render() { return h('div'); }
            });
            mount(MyComp, container);
            mount(MyComp, container);
            mount(MyComp, container);
            assert.equal(initCount, 1);
        });

        test('children попадают в props автоматически', () => {
            const container = createContainer();
            let receivedChildren = null;
            const Parent = Component({
                render(props) {
                    receivedChildren = props.children;
                    return h('div', null, props.children);
                }
            });
            mount(h(Parent, null, h('span', null, 'child')), container);
            assert.ok(receivedChildren);
        });
    });

    describe('memo() — защита render', () => {
        test('блокирует render при одинаковых зависимостях', () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                memo(props) { return [props.value]; },
                render(props) {
                    renderCount++;
                    return h('div', null, props.value);
                }
            });
            mount(h(MyComp, { value: 1 }), container);
            mount(h(MyComp, { value: 1 }), container);
            mount(h(MyComp, { value: 1 }), container);
            assert.equal(renderCount, 1);
        });

        test('разрешает render при изменении зависимостей', () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                memo(props) { return [props.value]; },
                render(props) {
                    renderCount++;
                    return h('div', null, props.value);
                }
            });
            mount(h(MyComp, { value: 1 }), container);
            mount(h(MyComp, { value: 2 }), container);
            mount(h(MyComp, { value: 3 }), container);
            assert.equal(renderCount, 3);
        });

        test('блокирует только текущий компонент, дети ререндерятся', () => {
            const container = createContainer();
            let parentRenders = 0;
            let childRenders = 0;

            const Child = Component({
                render() {
                    childRenders++;
                    return h('span', null, 'child');
                }
            });

            const Parent = Component({
                memo(props) { return [props.value]; },
                render() {
                    parentRenders++;
                    return h('div', null, h(Child));
                }
            });

            mount(h(Parent, { value: 1 }), container);
            mount(h(Parent, { value: 1 }), container);

            assert.equal(parentRenders, 1);
            assert.equal(childRenders, 2);
        });

        test('компонент без memo() всегда рендерится', () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                render() {
                    renderCount++;
                    return h('div');
                }
            });
            mount(h(MyComp, { v: 1 }), container);
            mount(h(MyComp, { v: 1 }), container);
            mount(h(MyComp, { v: 1 }), container);
            assert.equal(renderCount, 3);
        });

        test('memo() с объектами — сравнение по ссылке', () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                memo(props) { return [props.obj]; },
                render() {
                    renderCount++;
                    return h('div');
                }
            });
            const obj = { a: 1 };
            mount(h(MyComp, { obj }), container);
            mount(h(MyComp, { obj }), container);
            assert.equal(renderCount, 1);
            mount(h(MyComp, { obj: { a: 1 } }), container);
            assert.equal(renderCount, 2);
        });

        test('onUpdated не вызывается при блокировке memo', async () => {
            const container = createContainer();
            let updatedCount = 0;
            const MyComp = Component({
                memo(props) { return [props.value]; },
                onUpdated() { updatedCount++; },
                render(props) { return h('div', null, props.value); }
            });
            mount(h(MyComp, { value: 1 }), container);
            mount(h(MyComp, { value: 1 }), container);
            await delay(10);
            assert.equal(updatedCount, 0);
        });
    });

    describe('Lifecycle hooks', () => {
        test('onMounted вызывается один раз', async () => {
            const container = createContainer();
            let mountedCount = 0;
            const MyComp = Component({
                onMounted() { mountedCount++; },
                render() { return h('div'); }
            });
            mount(MyComp, container);
            await delay(10);
            assert.equal(mountedCount, 1);
        });

        test('onMounted вызывается children-first', async () => {
            const container = createContainer();
            const order = [];

            const Child = Component({
                onMounted() { order.push('child'); },
                render() { return h('span'); }
            });

            const Parent = Component({
                onMounted() { order.push('parent'); },
                render() { return h('div', null, h(Child)); }
            });

            mount(Parent, container);
            await delay(10);
            assert.deepEqual(order, ['child', 'parent']);
        });

        test('onUnmounted вызывается до удаления DOM', async () => {
            const container = createContainer();
            document.body.appendChild(container);
            let wasInDOM = false;

            const MyComp = Component({
                onUnmounted() {
                    wasInDOM = document.body.contains(container);
                },
                render() { return h('div'); }
            });

            mount(MyComp, container);
            await delay(10);
            mount(null, container);
            await delay(10);

            assert.ok(wasInDOM);
            document.body.removeChild(container);
        });

        test('onUpdated вызывается только при выполненном render', async () => {
            const container = createContainer();
            let updatedCount = 0;
            const MyComp = Component({
                count: 0,
                memo() { return [this.count]; },
                onUpdated() { updatedCount++; },
                render() { return h('div', null, this.count); }
            });
            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            inst.update({ count: 0 });
            await delay(10);
            assert.equal(updatedCount, 0);
            inst.update({ count: 1 });
            await delay(10);
            assert.equal(updatedCount, 1);
        });
    });

    describe('Context', () => {
        test('распространяется вниз по дереву', () => {
            const container = createContainer();
            let receivedLang = null;

            const Child = Component({
                render() {
                    receivedLang = this.context('lang');
                    return h('span');
                }
            });

            const Parent = Component({
                context: { lang() { return 'ru'; } },
                render() { return h('div', null, h(Child)); }
            });

            mount(Parent, container);
            assert.equal(receivedLang, 'ru');
        });

        test('contextSelf ищет сначала в себе', () => {
            const container = createContainer();
            let receivedLang = null;

            const MyComp = Component({
                context: { lang() { return 'self'; } },
                render() {
                    receivedLang = this.contextSelf('lang');
                    return h('div');
                }
            });

            mount(MyComp, container);
            assert.equal(receivedLang, 'self');
        });

        test('context() возвращает undefined когда нет провайдера', () => {
            const container = createContainer();
            let received = 'initial';

            const MyComp = Component({
                render() {
                    received = this.context('missing');
                    return h('div');
                }
            });

            mount(MyComp, container);
            assert.equal(received, undefined);
        });

        test('потомок переопределяет context родителя', () => {
            const container = createContainer();
            let received = null;

            const Deep = Component({
                render() {
                    received = this.context('theme');
                    return h('span');
                }
            });

            const Middle = Component({
                context: { theme() { return 'dark'; } },
                render() { return h('div', null, h(Deep)); }
            });

            const Top = Component({
                context: { theme() { return 'light'; } },
                render() { return h('div', null, h(Middle)); }
            });

            mount(Top, container);
            assert.equal(received, 'dark');
        });

        test('contextSelf рекурсия бросает ошибку', () => {
            const container = createContainer();
            let errorCaught = null;

            const MyComp = Component({
                context: {
                    x() { return this.contextSelf('x'); }
                },
                render() {
                    try {
                        this.contextSelf('x');
                    } catch (e) {
                        errorCaught = e;
                    }
                    return h('div');
                }
            });

            mount(MyComp, container);
            assert.ok(errorCaught);
            assert.ok(errorCaught.message.includes('recursion'));
        });
    });

    describe('Keys и Fragment', () => {
        test('Global keys сохраняют instance при перемещении', () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render() { return h('div'); }
            });

            mount(h('div', null, h(Item, { key: 'x' })), container);
            const firstInstance = instances[0];

            mount(h('div', null, h('span'), h(Item, { key: 'x' })), container);

            assert.equal(instances.length, 1);
            assert.equal(instances[0], firstInstance);
        });

        test('keyed Fragment переносится между родителями', () => {
            const container = createContainer();
            let childInits = 0;

            const Item = Component({
                init() { childInits++; },
                render() { return h('span'); }
            });

            mount(
                h('div', null,
                    h('div', { id: 'a' }, h(Fragment, { key: 'g' }, h(Item, { key: 'i' }))),
                    h('div', { id: 'b' })
                ),
                container
            );
            assert.equal(childInits, 1);

            mount(
                h('div', null,
                    h('div', { id: 'a' }),
                    h('div', { id: 'b' }, h(Fragment, { key: 'g' }, h(Item, { key: 'i' })))
                ),
                container
            );
            assert.equal(childInits, 1);
        });

        test('Fragment без key работает как прозрачная обёртка', () => {
            const container = createContainer();
            mount(
                h('div', null,
                    h(Fragment, null,
                        h('span', null, 'a'),
                        h('span', null, 'b')
                    )
                ),
                container
            );
            assert.equal(container.querySelectorAll('span').length, 2);
        });
    });

    describe('Refs lifecycle', () => {
        test('ref(node) вызывается при mount с DOM-узлом', () => {
            const container = createContainer();
            let received = null;
            const MyComp = Component({
                render() {
                    return h('input', { ref: (n) => { received = n; } });
                }
            });
            mount(MyComp, container);
            assert.ok(received);
            assert.equal(received.tagName, 'INPUT');
        });

        test('ref(null) вызывается при unmount', async () => {
            const container = createContainer();
            const calls = [];
            const MyComp = Component({
                render() {
                    return h('input', { ref: (n) => calls.push(n) });
                }
            });
            mount(MyComp, container);
            assert.ok(calls[0] !== null, 'первый вызов с DOM-узлом');
            mount(null, container);
            await delay(10);
            assert.equal(calls[calls.length - 1], null, 'последний вызов с null');
        });

        test('ref на компонент возвращает instance', () => {
            const container = createContainer();
            let received = null;
            const Child = Component({
                value: 42,
                render() { return h('div'); }
            });
            const Parent = Component({
                render() {
                    return h(Child, { ref: (inst) => { received = inst; } });
                }
            });
            mount(Parent, container);
            assert.ok(received);
            assert.equal(received.value, 42);
        });

        test('this.refs(name) создаёт стабильный collector', () => {
            const container = createContainer();
            const MyComp = Component({
                render() {
                    return h('div', null,
                        h('input', { ref: this.refs('inp1') }),
                        h('input', { ref: this.refs('inp2') })
                    );
                }
            });
            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            assert.ok(inst.refs.inp1);
            assert.ok(inst.refs.inp2);
            assert.equal(inst.refs.inp1.tagName, 'INPUT');
            assert.equal(inst.refs.inp2.tagName, 'INPUT');
        });
    });
}

console.log('\n✅ Test-node-01 инициализирован (46 тестов)\n');