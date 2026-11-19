const OperatorProfile = (() => {
  const spec = {
    id: 'operator',
    className: 'Operator',
    bindings: [
      { name: 'Device On', min: 0, max: 1, quantized: true },
      { name: 'Algorithm', min: 0, max: 10, quantized: true },
      { name: 'Osc-A Wave', quantized: true },
      { name: 'Ae Attack', min: 0, max: 1, quantized: false },
      { name: 'Filter On', min: 0, max: 1, quantized: true },
      { name: 'LFO On', min: 0, max: 1, quantized: true },
      { name: 'Pe On', min: 0, max: 1, quantized: true },
    ],
  };
  const views = new Map();
  const initialView = { page: 'osc-a', subpage: 'env' };

  function matches(device, kind) {
    return kind === spec.className && DeviceUI.audit(spec, device, kind).length === 0;
  }

  function render(device) {
    return `<section class="operator-panel" data-device-face aria-label="Operator controls">
      <div class="svg-device-host" data-svg-device="${device.id}" data-operator-device="${device.id}">
        <div class="svg-device-canvas"></div>
      </div>
    </section><button class="ut-all" data-op="device_parameter_view" data-device="${device.id}">All parameters</button>`;
  }

  function update(root, device, context = DeviceUI.context()) {
    const hosts = root.querySelectorAll(`[data-operator-device="${device.id}"]`);
    if (!hosts.length) return;
    const view = views.get(device.id) || initialView;
    const markup = OperatorRenderer.renderDevice(device, view);
    for (const host of hosts) DeviceSVGControls.draw(host, markup, device, context.pending);
  }

  function change(device, name, value) {
    const parameter = device.parameters.find(item => item.name === name);
    if (!parameter?.enabled || !Number.isFinite(value)) return [];
    const next = OperatorRenderer.bound(parameter.quantized ? Math.round(value) : value, parameter.min, parameter.max);
    return [{ ...parameter, value: next }];
  }

  function page(device, key) {
    const [page, subpage = 'env'] = key.split(':');
    if (!OperatorRenderer.PAGES.includes(page) || !['env', 'wave'].includes(subpage)) return;
    views.delete(device.id);
    views.set(device.id, { page, subpage });
    if (views.size > 64) views.delete(views.keys().next().value);
  }

  return { spec, matches, render, update, change, page };
})();
DeviceUI.register(OperatorProfile);
