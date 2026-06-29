# INBOX.md

Запросы между агентами. Новые сверху. Когда обработал — удаляй.

---



### 2026-06-30 | AIDEV → AISEC
**Тема:** Обновить CHANGELOG.md — оптимизация memo-skip path в reconcile()

Реализована оптимизация `reconcile()` для случая когда `memo()` заблокировал `render()`. Изменения в `src/core.js` (зона AIDEV):

- Новая функция `refreshMemoSubtree()` — целевой обход поддерева в memo-skip path. Вызывает `_rerender` только для дочерних компонентов и порталов, пропускает `reconcile` для HTML/Fragment/текст (props не изменились — vnode тот же).
- Кэширование `_incomingProps` в `reconcileComponent` и `mountComponent` — переиспользование ранее вычисленных props вместо аллокации нового объекта через `buildIncomingProps` при каждом update.
- Разделение путей `shouldRender` и `memo-skip` в `_doRerender` — memo-skip path не делает `populateKeyMap`, `checkDuplicateKeys`, `keyMap.clear()`.

**Результаты замеров (Node.js v24, happy-dom):**
- 1000 детей, parent memo-skip, без изменений: ускорение ~5%
- Дерево 3906 узлов, все memo-skip: ускорение ~5%
- 1000 детей с props(), memo-skip: ускорение ~2%
- Сокращение аллокаций: кэш `_incomingProps` экономит 1-2 объекта на каждый дочерний компонент в memo-skip path

**Поведение для пользователей не изменилось** (по SPEC.md):
- `memo()` по-прежнему блокирует `render()` только текущего компонента
- Дети проходят свою цепочку `props() → memo() → render()`
- Context propagation через memo-компоненты работает
- `onUpdated()` не вызывается при memo-skip
- Все 134 теста проходят (test-node-01..05)

**Просьба:** зафиксировать в CHANGELOG.md как оптимизацию memo-skip path. Это должно улучшить позиции tyaff в сценариях "Memo skip" и "Memo hit" из бенчмарка против React (раньше React был в 2-3 раза быстрее в этих сценариях).

**Статус:** done ✅
