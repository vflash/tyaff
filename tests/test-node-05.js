// ============================================================================
// Node.js тесты для VDOM библиотеки tyaff — Часть 5
// update() возвращает Promise<boolean> + Key identifiers
// Запуск: node --test tests/test-node-05.js
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

const { h, Component, Fragment, mount } = await import('../src/core.js');

function createContainer() {
    if (!hasDOM) throw new Error('DOM недоступен');
    return document.createElement('div');
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

if (hasDOM) {
    // =========================================================================
    // update() возвращает Promise<boolean>
    // =========================================================================
    describe('update() возвращает Promise<boolean>', () => {
        test('возвращает true когда render выполнился', async () => {
            const container = createContainer();
            const MyComp = Component({
                count: 0,
                render() { return h('div', null, this.count); }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;

            const result = await inst.update({ count: 1 });
            assert.equal(result, true);
            assert.equal(inst.count, 1);
        });

        test('возвращает false когда patch не изменил значений', async () => {
            const container = createContainer();
            const MyComp = Component({
                count: 5,
                render() { return h('div', null, this.count); }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;

            const result = await inst.update({ count: 5 });
            assert.equal(result, false);
            assert.equal(inst.count, 5);
        });

        test('возвращает false когда memo() заблокировал render', async () => {
            const container = createContainer();
            const MyComp = Component({
                memo(props) { return [props.value]; },
                render(props) { return h('div', null, props.value); }
            });

            const vnode = mount(h(MyComp, { value: 1 }), container);
            const inst = vnode._instance;

            // То же значение props.value — memo заблокирует render
            const result = await inst.update({ value: 1 });
            assert.equal(result, false);
        });

        test('возвращает false при update() во время init', async () => {
            const container = createContainer();
            let initResult = null;

            const MyComp = Component({
                init() {
                    this.update({ count: 10 }).then(r => { initResult = r; });
                },
                render() { return h('div'); }
            });

            mount(MyComp, container);
            await delay(10);

            assert.equal(initResult, false);
        });

        test('batching: все update() получают один результат', async () => {
            const container = createContainer();
            let renderCount = 0;

            const MyComp = Component({
                a: 0, b: 0, c: 0,
                render() { renderCount++; return h('div'); }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            renderCount = 0;

            const [r1, r2, r3] = await Promise.all([
                inst.update({ a: 1 }),
                inst.update({ b: 2 }),
                inst.update({ c: 3 })
            ]);

            assert.equal(r1, true);
            assert.equal(r2, true);
            assert.equal(r3, true);
            assert.equal(renderCount, 1, 'должен быть один render на всех');
        });

        test('update() без patch — принудительный render', async () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                render() { renderCount++; return h('div'); }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            renderCount = 0;

            const result = await inst.update();
            assert.equal(result, true);
            assert.equal(renderCount, 1);
        });

        test('принудительный update({}) с memo() может вернуть false', async () => {
            const container = createContainer();
            let renderCount = 0;
            const MyComp = Component({
                value: 1,
                memo() { return [this.value]; },
                render() { renderCount++; return h('div'); }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            renderCount = 0;

            // Принудительный update, но memo заблокирует (deps те же)
            const result = await inst.update({});
            assert.equal(result, false);
            assert.equal(renderCount, 0);
        });

        test('async chain: последовательные updates', async () => {
            const container = createContainer();
            const log = [];

            const MyComp = Component({
                count: 0,
                render() {
                    log.push('render:' + this.count);
                    return h('div', null, this.count);
                }
            });

            const vnode = mount(MyComp, container);
            const inst = vnode._instance;
            log.length = 0;

            const r1 = await inst.update({ count: 1 });
            const r2 = await inst.update({ count: 2 });
            const r3 = await inst.update({ count: 3 });

            assert.equal(r1, true);
            assert.equal(r2, true);
            assert.equal(r3, true);
            assert.deepEqual(log, ['render:1', 'render:2', 'render:3']);
        });
    });

    // =========================================================================
    // Key identifiers — формирование идентификаторов
    // =========================================================================
    describe('Key identifiers — формирование идентификаторов', () => {

        test('user key с запятой экранируется в ,,', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            mount(
                h('div', null,
                    h(Item, { key: 'fio,1', id: 'first' })
                ),
                container
            );
            const first = instances[0];

            mount(
                h('div', null,
                    h('span', null, 'spacer'),
                    h(Item, { key: 'fio,1', id: 'first' })
                ),
                container
            );

            assert.equal(instances.length, 1, 'instance не должен пересоздаваться');
            assert.equal(instances[0], first);
        });

        test('разные user keys с запятыми не конфликтуют', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            mount(
                h('div', null,
                    h(Item, { key: 'a,b', id: 'ab' }),
                    h(Item, { key: 'a', id: 'a' }),
                    h(Item, { key: 'b', id: 'b' })
                ),
                container
            );

            assert.equal(instances.length, 3, 'должны быть 3 разных instance');

            mount(
                h('div', null,
                    h(Item, { key: 'b', id: 'b' }),
                    h(Item, { key: 'a,b', id: 'ab' }),
                    h(Item, { key: 'a', id: 'a' })
                ),
                container
            );
            await delay(10);

            assert.equal(instances.length, 3, 'ни один не должен пересоздаться');

            const texts = Array.from(container.firstChild.children).map(el => el.textContent);
            assert.deepEqual(texts, ['b', 'ab', 'a']);
        });

        test('дубликаты user key выводят warning', async () => {
            const container = createContainer();
            const warnings = [];
            const origWarn = console.warn;
            const origError = console.error;
            console.warn = (...args) => warnings.push(args.join(' '));
            console.error = (...args) => warnings.push(args.join(' '));

            try {
                const Item = Component({
                    render() { return h('div'); }
                });

                mount(
                    h('div', null,
                        h(Item, { key: 'duplicate' }),
                        h(Item, { key: 'duplicate' })
                    ),
                    container
                );

                const hasWarning = warnings.some(e =>
                    e.toLowerCase().includes('duplicate') &&
                    e.toLowerCase().includes('key')
                );
                assert.ok(hasWarning,
                    'должно быть предупреждение о дубликате. Вывод: ' +
                    (warnings.length ? warnings.join(' | ') : '(пусто)')
                );
            } finally {
                console.warn = origWarn;
                console.error = origError;
            }
        });

        test('автоматический ключ по пути сохраняется при том же порядке', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('span', null, props.id); }
            });

            mount(
                h('div', null,
                    h(Item, { id: 'a' }),
                    h(Item, { id: 'b' })
                ),
                container
            );
            assert.equal(instances.length, 2);

            mount(
                h('div', null,
                    h(Item, { id: 'a' }),
                    h(Item, { id: 'b' })
                ),
                container
            );
            assert.equal(instances.length, 2, 'те же instance при том же порядке');
        });

        test('user key и automatic key не конфликтуют', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            mount(
                h('div', null,
                    h(Item, { key: '0', id: 'user' }),
                    h(Item, { id: 'auto' })
                ),
                container
            );

            assert.equal(instances.length, 2, 'оба должны создаться');
            assert.notEqual(instances[0], instances[1], 'разные instance');
        });

        test('key с различными спецсимволами работает корректно', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            const specialKeys = [
                'key-with-dash',
                'key.with.dots',
                'key#with#hash',
                'key with spaces',
                'key/with/slashes',
                'ключ-на-кириллице',
                '123',
                '',
                'a,b,c,d,e'
            ];

            mount(
                h('div', null,
                    ...specialKeys.map((key, i) =>
                        h(Item, { key, id: i })
                    )
                ),
                container
            );

            assert.equal(instances.length, specialKeys.length);

            mount(
                h('div', null,
                    ...[...specialKeys].reverse().map((key, i) =>
                        h(Item, { key, id: specialKeys.length - 1 - i })
                    )
                ),
                container
            );
            await delay(10);

            assert.equal(instances.length, specialKeys.length,
                'все instance должны сохраниться после перемешивания');
        });

        test('множественные запятые в key экранируются', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            mount(
                h('div', null,
                    h(Item, { key: 'a,,b', id: 'double' }),
                    h(Item, { key: 'a,b', id: 'single' })
                ),
                container
            );

            assert.equal(instances.length, 2, 'должны быть 2 разных instance');

            // ⚠️ Ищем по props.id, а не по id
            const doubleInst = instances.find(i => i.props.id === 'double');
            const singleInst = instances.find(i => i.props.id === 'single');
            assert.ok(doubleInst, 'double instance создан');
            assert.ok(singleInst, 'single instance создан');
            assert.notEqual(doubleInst, singleInst, 'разные instance');

            // Перемешиваем
            mount(
                h('div', null,
                    h(Item, { key: 'a,b', id: 'single' }),
                    h(Item, { key: 'a,,b', id: 'double' })
                ),
                container
            );
            await delay(10);

            // Instance'ы не должны пересоздаваться
            assert.equal(instances.length, 2, 'instance не должны пересоздаваться');

            // Проверяем что DOM в правильном порядке
            const children = container.firstChild.children;
            assert.equal(children.length, 2);
            assert.equal(children[0].textContent, 'single', 'первый child = single');
            assert.equal(children[1].textContent, 'double', 'второй child = double');
        });

        test('user key уникален в пределах render — разные позиции', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', null, props.id); }
            });

            mount(
                h('div', null,
                    h('span'),
                    h(Item, { key: 'mykey', id: 'first-pos' })
                ),
                container
            );
            const first = instances[0];

            mount(
                h('div', null,
                    h(Item, { key: 'mykey', id: 'second-pos' }),
                    h('span')
                ),
                container
            );
            await delay(10);

            assert.equal(instances.length, 1, 'instance не должен пересоздаваться');
            assert.equal(instances[0], first, 'тот же instance');
        });
    });
}

console.log('\n✅ Test-node-05 инициализирован (16 тестов)\n');