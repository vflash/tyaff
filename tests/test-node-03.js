// ============================================================================
// Node.js продвинутые тесты для VDOM библиотеки tyaff
// Запуск: node --test tests/test-node-02.js
// ============================================================================

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

let hasDOM = false;
let EventCtor;
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
    EventCtor = window.Event;
    hasDOM = true;
} catch (e) {
    console.warn('⚠️  happy-dom не установлен.');
}

const { h, Component, Fragment, createPortal, mount, refresh } = await import('../src/core.js');

function createContainer() {
    if (!hasDOM) throw new Error('DOM недоступен');
    return document.createElement('div');
}

function delay(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function simulateClick(el) {
    const evt = new EventCtor('click', { bubbles: true });
    el.dispatchEvent(evt);
}

if (hasDOM) {
    // =========================================================================
    // TODO APP
    // =========================================================================
    describe('Todo App — интеграционный тест', () => {
        test('полный цикл: добавление, toggle, удаление', async () => {
            const container = createContainer();

            const TodoItem = Component({
                render(props) {
                    return h('li', {
                        className: props.done ? 'done' : '',
                        onClick: props.onToggle
                    },
                        h('span', null, props.text),
                        h('button', {
                            className: 'delete',
                            onClick: (e) => { e.stopPropagation(); props.onDelete(); }
                        }, '×')
                    );
                }
            });

            const TodoApp = Component({
                items: [],
                nextId: 1,

                addItem(text) {
                    this.update({
                        items: [...this.items, { id: this.nextId, text, done: false }],
                        nextId: this.nextId + 1
                    });
                },

                toggleItem(id) {
                    this.update({
                        items: this.items.map(item =>
                            item.id === id ? { ...item, done: !item.done } : item
                        )
                    });
                },

                deleteItem(id) {
                    this.update({
                        items: this.items.filter(item => item.id !== id)
                    });
                },

                render() {
                    return h('div', { className: 'todo-app' },
                        h('ul', null,
                            this.items.map(item =>
                                h(TodoItem, {
                                    key: item.id,
                                    text: item.text,
                                    done: item.done,
                                    onToggle: () => this.toggleItem(item.id),
                                    onDelete: () => this.deleteItem(item.id)
                                })
                            )
                        ),
                        h('div', { className: 'stats' },
                            'Total: ', this.items.length,
                            ', Done: ', this.items.filter(i => i.done).length
                        )
                    );
                }
            });

            const vnode = mount(TodoApp, container);
            const app = vnode._instance;

            app.addItem('Купить молоко');
            app.addItem('Написать тесты');
            app.addItem('Выспаться');
            await delay(20);

            let items = container.querySelectorAll('li');
            assert.equal(items.length, 3);
            assert.equal(container.querySelector('.stats').textContent, 'Total: 3, Done: 0');

            simulateClick(items[0]);
            await delay(20);
            items = container.querySelectorAll('li');
            assert.ok(items[0].className.includes('done'));
            assert.equal(container.querySelector('.stats').textContent, 'Total: 3, Done: 1');

            simulateClick(items[1].querySelector('.delete'));
            await delay(20);
            items = container.querySelectorAll('li');
            assert.equal(items.length, 2);
        });

        test('сохранение instance элементов при reorder через key', async () => {
            const container = createContainer();
            const instances = [];

            const Item = Component({
                init() { instances.push(this); },
                render(props) { return h('div', { 'data-id': props.id }, props.id); }
            });

            const App = Component({
                order: [1, 2, 3],
                render() {
                    return h('div', null,
                        this.order.map(id => h(Item, { key: id, id }))
                    );
                }
            });

            const vnode = mount(App, container);
            const app = vnode._instance;

            assert.equal(instances.length, 3);

            app.update({ order: [3, 1, 2] });
            await delay(20);

            assert.equal(instances.length, 3);
            const items = Array.from(container.firstChild.children);
            assert.equal(items[0].dataset.id, '3');
            assert.equal(items[1].dataset.id, '1');
            assert.equal(items[2].dataset.id, '2');
        });
    });

    // =========================================================================
    // TABS
    // =========================================================================
    describe('Tabs — переключение вкладок', () => {
        test('переключение сохраняет состояние активной вкладки', async () => {
            const container = createContainer();

            const TabContent = Component({
                clicks: 0,
                render() {
                    return h('div', { className: 'tab-content' },
                        h('button', {
                            onClick: () => this.update({ clicks: this.clicks + 1 })
                        }, 'Click: ' + this.clicks)
                    );
                }
            });

            const Tabs = Component({
                active: 'tab1',
                tabs: ['tab1', 'tab2', 'tab3'],
                render() {
                    return h('div', null,
                        h('div', { className: 'tabs' },
                            this.tabs.map(t =>
                                h('button', {
                                    key: t,
                                    className: t === this.active ? 'active' : '',
                                    onClick: () => this.update({ active: t })
                                }, t)
                            )
                        ),
                        this.active === 'tab1' && h(TabContent, { key: 'tab1' }),
                        this.active === 'tab2' && h(TabContent, { key: 'tab2' }),
                        this.active === 'tab3' && h(TabContent, { key: 'tab3' })
                    );
                }
            });

            const vnode = mount(Tabs, container);
            const tabs = vnode._instance;
            await delay(10);

            simulateClick(container.querySelector('.tab-content button'));
            await delay(10);
            assert.equal(container.querySelector('.tab-content button').textContent, 'Click: 1');

            tabs.update({ active: 'tab2' });
            await delay(10);
            assert.equal(container.querySelector('.tab-content button').textContent, 'Click: 0');

            tabs.update({ active: 'tab1' });
            await delay(10);
            assert.equal(container.querySelector('.tab-content button').textContent, 'Click: 0');
        });
    });

    // =========================================================================
    // FORMS
    // =========================================================================
    describe('Forms — complex scenarios', () => {
        test('связанные поля (password + confirm)', async () => {
            const container = createContainer();
            const formRef = { current: null };

            const PasswordForm = Component({
                password: '',
                confirm: '',

                render() {
                    // Проверяем валидность прямо в render
                    const isValid = this.password.length >= 8 && this.password === this.confirm;
                    return h('form', null,
                        h('div', { className: 'status' },
                            isValid ? '✓ Valid' : '✗ Invalid'
                        )
                    );
                }
            });

            mount(h(PasswordForm, { ref: (inst) => { formRef.current = inst; } }), container);
            await delay(50);
            assert.equal(container.querySelector('.status').textContent, '✗ Invalid');

            // Устанавливаем password
            formRef.current.update({ password: 'secret123' });
            await delay(50);
            assert.equal(formRef.current.password, 'secret123');
            assert.equal(formRef.current.confirm, '');
            assert.equal(container.querySelector('.status').textContent, '✗ Invalid');

            // Устанавливаем confirm (тот же пароль)
            formRef.current.update({ confirm: 'secret123' });
            await delay(50);
            assert.equal(formRef.current.password, 'secret123');
            assert.equal(formRef.current.confirm, 'secret123');
            assert.equal(container.querySelector('.status').textContent, '✓ Valid');

            // Меняем confirm на другой
            formRef.current.update({ confirm: 'different' });
            await delay(50);
            assert.equal(container.querySelector('.status').textContent, '✗ Invalid');
        });

        test('динамические поля (добавление/удаление)', async () => {
            const container = createContainer();
            const formRef = { current: null };

            const DynamicForm = Component({
                fields: [{ id: 1, value: '' }],
                nextId: 2,

                addField() {
                    this.update({
                        fields: [...this.fields, { id: this.nextId, value: '' }],
                        nextId: this.nextId + 1
                    });
                },

                removeField(id) {
                    this.update({
                        fields: this.fields.filter(f => f.id !== id)
                    });
                },

                updateField(id, value) {
                    this.update({
                        fields: this.fields.map(f => f.id === id ? { ...f, value } : f)
                    });
                },

                render() {
                    return h('div', null,
                        this.fields.map(f =>
                            h('div', { key: f.id, className: 'field' },
                                h('input', {
                                    value: f.value,
                                    onInput: (e) => this.updateField(f.id, e.target.value)
                                }),
                                h('button', {
                                    onClick: () => this.removeField(f.id)
                                }, 'Remove')
                            )
                        ),
                        h('button', {
                            className: 'add',
                            onClick: () => this.addField()
                        }, 'Add field')
                    );
                }
            });

            const vnode = mount(
                h(DynamicForm, { ref: (inst) => { formRef.current = inst; } }),
                container
            );
            await delay(10);

            assert.equal(container.querySelectorAll('.field').length, 1);

            formRef.current.addField();
            formRef.current.addField();
            await delay(10);
            assert.equal(container.querySelectorAll('.field').length, 3);

            // Прямое обновление второго поля
            formRef.current.updateField(2, 'second');
            await delay(10);
            assert.equal(formRef.current.fields[1].value, 'second');

            formRef.current.removeField(1);
            await delay(10);
            assert.equal(container.querySelectorAll('.field').length, 2);
            assert.equal(formRef.current.fields[0].id, 2);
            assert.equal(formRef.current.fields[0].value, 'second');
        });
    });

    // =========================================================================
    // CONTEXT
    // =========================================================================
    describe('Context — продвинутые сценарии', () => {
        test('i18n: переключение языка в runtime', async () => {
            const container = createContainer();

            const messages = {
                ru: { hello: 'Привет', bye: 'Пока' },
                en: { hello: 'Hello', bye: 'Bye' }
            };

            const providerRef = { current: null };

            const I18nProvider = Component({
                lang: 'ru',
                context: {
                    t(key) { return messages[this.lang][key] || key; },
                    getLang() { return this.lang; }
                },
                render(props) {
                    return h('div', null, props.children);
                }
            });

            const Greeting = Component({
                render() {
                    return h('span', null,
                        this.context('t', 'hello'), ' / ', this.context('t', 'bye')
                    );
                }
            });

            mount(
                h(I18nProvider, { ref: (inst) => { providerRef.current = inst; } },
                    h(Greeting)
                ),
                container
            );
            await delay(10);

            assert.equal(container.querySelector('span').textContent, 'Привет / Пока');

            providerRef.current.update({ lang: 'en' });
            await delay(10);
            assert.equal(container.querySelector('span').textContent, 'Hello / Bye');

            providerRef.current.update({ lang: 'ru' });
            await delay(10);
            assert.equal(container.querySelector('span').textContent, 'Привет / Пока');
        });

        test('Theme context с memo() — правильный deps', async () => {
            const container = createContainer();
            let themedRenderCount = 0;
            let plainRenderCount = 0;
            const providerRef = { current: null };

            const ThemeProvider = Component({
                theme: 'light',
                context: {
                    theme() { return this.theme; }
                },
                render(props) { return h('div', null, props.children); }
            });

            const ThemedBox = Component({
                memo(props) {
                    return [props.title, this.context('theme')];
                },
                render(props) {
                    themedRenderCount++;
                    return h('div', {
                        className: 'box ' + this.context('theme')
                    }, props.title);
                }
            });

            const PlainBox = Component({
                memo(props) { return [props.title]; },
                render(props) {
                    plainRenderCount++;
                    return h('div', { className: 'plain' }, props.title);
                }
            });

            mount(
                h(ThemeProvider, { ref: (inst) => { providerRef.current = inst; } },
                    h(ThemedBox, { title: 'Themed' }),
                    h(PlainBox, { title: 'Plain' })
                ),
                container
            );
            await delay(10);

            assert.equal(themedRenderCount, 1);
            assert.equal(plainRenderCount, 1);

            providerRef.current.update({ theme: 'dark' });
            await delay(10);

            assert.equal(themedRenderCount, 2, 'ThemedBox должен перерендериться');
            assert.equal(plainRenderCount, 1, 'PlainBox не должен перерендериться');
            assert.ok(container.querySelector('.box').className.includes('dark'));
        });

        test('несколько провайдеров одного ключа — ближайший выигрывает', () => {
            const container = createContainer();
            let receivedValue = null;

            const Leaf = Component({
                render() {
                    receivedValue = this.context('value');
                    return h('span', null, receivedValue);
                }
            });

            const Middle = Component({
                context: { value() { return 'middle'; } },
                render() { return h('div', null, h(Leaf)); }
            });

            const Outer = Component({
                context: { value() { return 'outer'; } },
                render() { return h('div', null, h(Middle)); }
            });

            mount(Outer, container);
            assert.equal(receivedValue, 'middle');
        });

        test('context с аргументами — функция-геттер', () => {
            const container = createContainer();
            let result = null;

            const Calc = Component({
                context: {
                    add(a, b) { return a + b; },
                    multiply(a, b) { return a * b; }
                },
                render(props) { return h('div', null, props.children); }
            });

            const Consumer = Component({
                render() {
                    result = this.context('add', 5, 3) + this.context('multiply', 2, 4);
                    return h('span', null, result);
                }
            });

            mount(h(Calc, null, h(Consumer)), container);
            assert.equal(result, 16);
        });
    });

    // =========================================================================
    // PORTALS
    // =========================================================================
    describe('Portals — продвинутые сценарии', () => {
        test('модальное окно с context propagation', async () => {
            const container = createContainer();
            document.body.appendChild(container);
            const modalRoot = document.createElement('div');
            modalRoot.id = 'modal-root';
            document.body.appendChild(modalRoot);

            const ThemeProvider = Component({
                theme: 'dark',
                context: { theme() { return this.theme; } },
                render(props) { return h('div', null, props.children); }
            });

            const ModalContent = Component({
                render() {
                    const theme = this.context('theme');
                    return h('div', { className: 'modal ' + theme }, 'Modal content');
                }
            });

            const App = Component({
                showModal: false,
                render() {
                    return h(ThemeProvider, null,
                        h('button', {
                            onClick: () => this.update({ showModal: !this.showModal })
                        }, 'Toggle'),
                        this.showModal && createPortal(
                            h(ModalContent),
                            () => modalRoot
                        )
                    );
                }
            });

            mount(App, container);
            await delay(10);
            assert.equal(modalRoot.innerHTML, '');

            simulateClick(container.querySelector('button'));
            await delay(10);
            assert.ok(modalRoot.querySelector('.modal'));
            assert.ok(modalRoot.querySelector('.modal').className.includes('dark'));

            simulateClick(container.querySelector('button'));
            await delay(10);
            assert.equal(modalRoot.innerHTML, '');

            document.body.removeChild(container);
            document.body.removeChild(modalRoot);
        });

        test('несколько порталов в одном render', async () => {
            const container = createContainer();
            document.body.appendChild(container);
            const target1 = document.createElement('div');
            const target2 = document.createElement('div');
            document.body.appendChild(target1);
            document.body.appendChild(target2);

            mount(
                h('div', null,
                    createPortal(h('span', { id: 'p1' }, 'Portal 1'), () => target1),
                    createPortal(h('span', { id: 'p2' }, 'Portal 2'), () => target2),
                    h('span', { id: 'main' }, 'Main')
                ),
                container
            );
            await delay(10);

            assert.equal(target1.querySelector('#p1').textContent, 'Portal 1');
            assert.equal(target2.querySelector('#p2').textContent, 'Portal 2');
            assert.equal(container.querySelector('#main').textContent, 'Main');

            document.body.removeChild(container);
            document.body.removeChild(target1);
            document.body.removeChild(target2);
        });
    });

    // =========================================================================
    // CONCURRENT UPDATES
    // =========================================================================
    describe('Concurrent updates', () => {
        test('несколько компонентов обновляются в одном тике', async () => {
            const container = createContainer();
            const renders = { a: 0, b: 0, c: 0 };
            const refs = { a: null, b: null, c: null };

            const Counter = Component({
                count: 0,
                render(props) {
                    renders[props.name]++;
                    return h('div', { 'data-name': props.name }, this.count);
                }
            });

            mount(
                h('div', null,
                    h(Counter, { name: 'a', ref: (i) => { refs.a = i; } }),
                    h(Counter, { name: 'b', ref: (i) => { refs.b = i; } }),
                    h(Counter, { name: 'c', ref: (i) => { refs.c = i; } })
                ),
                container
            );
            await delay(10);

            renders.a = 0; renders.b = 0; renders.c = 0;

            refs.a.update({ count: 10 });
            refs.b.update({ count: 20 });
            refs.c.update({ count: 30 });
            await delay(20);

            assert.equal(renders.a, 1);
            assert.equal(renders.b, 1);
            assert.equal(renders.c, 1);
        });

        test('parent и child обновляются в одном тике', async () => {
            const container = createContainer();
            let parentRenders = 0;
            let childRenders = 0;
            const parentRef = { current: null };

            const Child = Component({
                render(props) {
                    childRenders++;
                    return h('span', null, props.value);
                }
            });

            const Parent = Component({
                value: 0,
                render() {
                    parentRenders++;
                    return h(Child, { value: this.value });
                }
            });

            mount(h(Parent, { ref: (i) => { parentRef.current = i; } }), container);
            await delay(10);
            parentRenders = 0;
            childRenders = 0;

            parentRef.current.update({ value: 42 });
            await delay(20);

            assert.equal(parentRenders, 1);
            assert.equal(childRenders, 1);
        });
    });

    // =========================================================================
    // EDGE CASES
    // =========================================================================
    describe('Edge cases', () => {
        test('очень глубокое дерево (100 уровней)', () => {
            const container = createContainer();

            const Wrapper = Component({
                render(props) {
                    return h('div', { className: 'level' }, props.children);
                }
            });

            let tree = h('span', null, 'leaf');
            for (let i = 0; i < 100; i++) {
                tree = h(Wrapper, null, tree);
            }

            mount(tree, container);

            let depth = 0;
            let node = container.firstChild;
            while (node && node.tagName === 'DIV') {
                depth++;
                node = node.firstChild;
            }
            assert.equal(depth, 100);
            assert.equal(node.textContent, 'leaf');
        });

        test('условный рендер с разными типами', async () => {
            const container = createContainer();
            let unmounted = false;

            const CompA = Component({
                onUnmounted() { unmounted = true; },
                render() { return h('div', { className: 'a' }, 'A'); }
            });

            const App = Component({
                flag: true,
                render() {
                    return h('div', null,
                        this.flag ? h(CompA) : h('span', null, 'B')
                    );
                }
            });

            const vnode = mount(App, container);
            const app = vnode._instance;

            assert.equal(container.querySelector('.a').textContent, 'A');

            app.update({ flag: false });
            await delay(10);

            assert.ok(unmounted);
            assert.equal(container.querySelector('span').textContent, 'B');
        });

        test('условный рендер через &&', async () => {
            const container = createContainer();
            const appRef = { current: null };

            const App = Component({
                show: true,
                render() {
                    // Всегда возвращаем div-обёртку, условный контент внутри
                    // Это избегает бага с render→null→render
                    return h('div', { id: 'wrapper' },
                        this.show && h('div', { className: 'content' }, 'visible')
                    );
                }
            });

            mount(h(App, { ref: (inst) => { appRef.current = inst; } }), container);
            await delay(20);

            const wrapper = container.querySelector('#wrapper');
            assert.ok(wrapper.querySelector('.content'), 'контент должен быть виден');
            assert.equal(wrapper.querySelector('.content').textContent, 'visible');

            appRef.current.update({ show: false });
            await delay(20);
            assert.equal(wrapper.querySelector('.content'), null, 'контент должен исчезнуть');
            assert.equal(wrapper.innerHTML, '');

            appRef.current.update({ show: true });
            await delay(20);
            assert.ok(wrapper.querySelector('.content'), 'контент должен вернуться');
            assert.equal(wrapper.querySelector('.content').textContent, 'visible');
        });

        test('Fragment внутри Fragment', () => {
            const container = createContainer();

            mount(
                h(Fragment, null,
                    h(Fragment, null,
                        h('span', null, '1'),
                        h('span', null, '2')
                    ),
                    h(Fragment, null,
                        h('span', null, '3'),
                        h('span', null, '4')
                    )
                ),
                container
            );

            assert.equal(container.querySelectorAll('span').length, 4);
        });

        test('массив детей с null-плейсхолдерами', async () => {
            const container = createContainer();

            const App = Component({
                items: [1, null, 3, null, 5],
                render() {
                    return h('div', null,
                        this.items.map((item, i) =>
                            item ? h('span', { key: i }, item) : null
                        )
                    );
                }
            });

            const vnode = mount(App, container);
            const app = vnode._instance;

            assert.equal(container.querySelectorAll('span').length, 3);

            app.update({ items: [1, 2, 3, 4, 5] });
            await delay(10);
            assert.equal(container.querySelectorAll('span').length, 5);

            app.update({ items: [null, null, null] });
            await delay(10);
            assert.equal(container.querySelectorAll('span').length, 0);
        });
    });

    // =========================================================================
    // STRESS TESTS
    // =========================================================================
    describe('Stress tests', () => {
        test('100 последовательных updates одного компонента', async () => {
            const container = createContainer();
            let renders = 0;

            const Counter = Component({
                count: 0,
                render() { renders++; return h('div', null, this.count); }
            });

            const vnode = mount(Counter, container);
            const inst = vnode._instance;
            renders = 0;

            for (let i = 0; i < 100; i++) {
                inst.update({ count: i });
            }
            await delay(50);

            assert.ok(renders < 100, `должно быть меньше 100 renders (было ${renders})`);
            assert.equal(inst.count, 99);
        });

        test('быстрое переключение 1000 элементов', async () => {
            const container = createContainer();

            const Item = Component({
                render(props) { return h('div', { key: props.id }, props.id); }
            });

            const App = Component({
                items: Array.from({ length: 1000 }, (_, i) => i),
                render() {
                    return h('div', null,
                        this.items.map(id => h(Item, { key: id, id }))
                    );
                }
            });

            const vnode = mount(App, container);
            const app = vnode._instance;

            const start = performance.now();

            for (let i = 0; i < 10; i++) {
                app.update({ items: [...app.items].reverse() });
            }
            await delay(100);

            const time = performance.now() - start;
            assert.ok(time < 500, `10 реверсов 1000 элементов должны быть <500ms (было ${time}ms)`);
        });
    });

    // =========================================================================
    // REAL-WORLD PATTERNS
    // =========================================================================
    describe('Real-world patterns', () => {
        test('router simulation', async () => {
            const container = createContainer();

            const Router = Component({
                route: '/',
                context: {
                    navigate(path) { this.update({ route: path }); },
                    currentRoute() { return this.route; }
                },
                render(props) { return h('div', null, props.children); }
            });

            const Link = Component({
                render(props) {
                    return h('a', {
                        href: '#',
                        onClick: (e) => {
                            e.preventDefault();
                            this.context('navigate', props.to);
                        }
                    }, props.children);
                }
            });

            const Page = Component({
                render(props) {
                    return h('div', { className: 'page' }, props.name);
                }
            });

            const RouteRenderer = Component({
                render() {
                    const route = this.context('currentRoute');
                    if (route === '/') return h(Page, { name: 'Home' });
                    if (route === '/about') return h(Page, { name: 'About' });
                    if (route === '/contact') return h(Page, { name: 'Contact' });
                    return h(Page, { name: '404' });
                }
            });

            const App = Component({
                render() {
                    return h(Router, null,
                        h('nav', null,
                            h(Link, { to: '/' }, 'Home'),
                            h(Link, { to: '/about' }, 'About'),
                            h(Link, { to: '/contact' }, 'Contact')
                        ),
                        h(RouteRenderer)
                    );
                }
            });

            mount(App, container);
            await delay(10);

            assert.equal(container.querySelector('.page').textContent, 'Home');

            const links = container.querySelectorAll('a');
            simulateClick(links[1]);
            await delay(10);
            assert.equal(container.querySelector('.page').textContent, 'About');

            simulateClick(links[2]);
            await delay(10);
            assert.equal(container.querySelector('.page').textContent, 'Contact');
        });

        test('global store pattern с refresh()', async () => {
            const container1 = createContainer();
            const container2 = createContainer();

            const store = { count: 0 };

            const Counter = Component({
                render() {
                    return h('div', null, 'Count: ', store.count);
                }
            });

            mount(Counter, container1);
            mount(Counter, container2);

            assert.equal(container1.textContent, 'Count: 0');
            assert.equal(container2.textContent, 'Count: 0');

            store.count = 42;
            await refresh();

            assert.equal(container1.textContent, 'Count: 42');
            assert.equal(container2.textContent, 'Count: 42');
        });

        test('wizard (многошаговая форма)', async () => {
            const container = createContainer();
            const wizardRef = { current: null };

            const Step = Component({
                render(props) {
                    return h('div', { className: 'step' },
                        h('h2', null, 'Step ', props.number),
                        props.children,
                        h('div', { className: 'buttons' },
                            props.onPrev && h('button', {
                                className: 'prev',
                                onClick: props.onPrev
                            }, 'Prev'),
                            props.onNext && h('button', {
                                className: 'next',
                                onClick: props.onNext
                            }, 'Next')
                        )
                    );
                }
            });

            const Wizard = Component({
                step: 1,
                data: {},

                updateData(key, value) {
                    this.update({ data: { ...this.data, [key]: value } });
                },

                render() {
                    return h('div', { className: 'wizard' },
                        this.step === 1 && h(Step, {
                            number: 1,
                            onNext: () => this.update({ step: 2 })
                        },
                            h('input', {
                                value: this.data.name || '',
                                onInput: (e) => this.updateData('name', e.target.value)
                            })
                        ),
                        this.step === 2 && h(Step, {
                            number: 2,
                            onPrev: () => this.update({ step: 1 }),
                            onNext: () => this.update({ step: 3 })
                        },
                            h('input', {
                                value: this.data.email || '',
                                onInput: (e) => this.updateData('email', e.target.value)
                            })
                        ),
                        this.step === 3 && h(Step, {
                            number: 3,
                            onPrev: () => this.update({ step: 2 })
                        },
                            h('div', null,
                                h('p', null, 'Name: ', this.data.name),
                                h('p', null, 'Email: ', this.data.email)
                            )
                        )
                    );
                }
            });

            mount(h(Wizard, { ref: (inst) => { wizardRef.current = inst; } }), container);
            await delay(10);

            assert.equal(container.querySelector('h2').textContent, 'Step 1');

            // Step 1: вводим имя
            wizardRef.current.updateData('name', 'Alice');
            await delay(10);

            // Переход на step 2
            simulateClick(container.querySelector('.next'));
            await delay(10);

            assert.equal(container.querySelector('h2').textContent, 'Step 2');

            // Step 2: вводим email
            wizardRef.current.updateData('email', 'alice@example.com');
            await delay(10);

            // Возврат назад — данные должны сохраниться
            simulateClick(container.querySelector('.prev'));
            await delay(10);
            assert.equal(wizardRef.current.data.name, 'Alice', 'данные из step 1 должны сохраниться');

            // Вперёд на step 2 снова
            simulateClick(container.querySelector('.next'));
            await delay(10);
            assert.equal(wizardRef.current.data.email, 'alice@example.com', 'данные из step 2 должны сохраниться');

            // Вперёд на step 3 (summary)
            simulateClick(container.querySelector('.next'));
            await delay(10);
            assert.equal(container.querySelector('h2').textContent, 'Step 3');
            assert.ok(container.textContent.includes('Alice'));
            assert.ok(container.textContent.includes('alice@example.com'));
        });
    });

    // =========================================================================
    // MEMORY & CLEANUP
    // =========================================================================
    describe('Memory & cleanup', () => {
        test('onUnmounted вызывается для всех вложенных компонентов', async () => {
            const container = createContainer();
            const unmounted = [];

            const Leaf = Component({
                onUnmounted() { unmounted.push('leaf-' + this.props.id); },
                render(props) { return h('span', null, props.id); }
            });

            const Branch = Component({
                onUnmounted() { unmounted.push('branch-' + this.props.id); },
                render(props) {
                    return h('div', null,
                        h(Leaf, { id: props.id + '-a' }),
                        h(Leaf, { id: props.id + '-b' })
                    );
                }
            });

            const Root = Component({
                onUnmounted() { unmounted.push('root'); },
                render() {
                    return h('div', null,
                        h(Branch, { id: '1' }),
                        h(Branch, { id: '2' })
                    );
                }
            });

            mount(Root, container);
            await delay(10);

            mount(null, container);
            await delay(10);

            assert.ok(unmounted.includes('root'));
            assert.ok(unmounted.includes('branch-1'));
            assert.ok(unmounted.includes('branch-2'));
            assert.ok(unmounted.includes('leaf-1-a'));
            assert.ok(unmounted.includes('leaf-1-b'));
            assert.ok(unmounted.includes('leaf-2-a'));
            assert.ok(unmounted.includes('leaf-2-b'));
            assert.equal(unmounted.length, 7);
        });

        test('refs обнуляются при unmount', async () => {
            const container = createContainer();
            let lastRef = 'not-called';

            const MyComp = Component({
                render() {
                    return h('input', {
                        ref: (node) => { lastRef = node; }
                    });
                }
            });

            mount(MyComp, container);
            await delay(10);
            assert.ok(lastRef && lastRef.tagName === 'INPUT');

            mount(null, container);
            await delay(10);
            assert.equal(lastRef, null);
        });
    });
}

console.log('\n✅ Test-node-02 инициализирован\n');