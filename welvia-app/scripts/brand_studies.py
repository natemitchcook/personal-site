"""Original vector motion studies; no third-party artwork or assets."""
SHAPES={
'relay':'<path class="rail" d="M12 44 Q22 44 22 32 T42 20 H52" stroke-width="5"/><circle class="traveler" cx="12" cy="44" r="6" fill="currentColor" stroke="none"/>',
'orbit':'<g class="satellites"><ellipse cx="32" cy="32" rx="23" ry="12" transform="rotate(-35 32 32)" stroke-width="4"/><circle cx="51" cy="20" r="5" fill="currentColor" stroke="none"/></g><circle cx="32" cy="32" r="6" fill="currentColor" stroke="none"/>',
'fold':'<path class="wing left" d="M10 18 L24 46 L32 28"/><path class="wing right" d="M32 28 L40 46 L54 18"/>',
'weave':'<path class="thread one" d="M12 18 C32 18 32 46 52 46"/><path class="thread two" d="M12 46 C32 46 32 18 52 18"/>',
'beacon':'<circle class="echo outer" cx="32" cy="32" r="23" stroke-width="3"/><circle class="echo inner" cx="32" cy="32" r="15" stroke-width="4"/><circle cx="32" cy="32" r="6" fill="currentColor" stroke="none"/>',
'hinge':'<path d="M14 49 V17 H35 V49" stroke-width="5"/><path class="panel" d="M35 17 L51 12 V44 L35 49 Z" fill="currentColor" stroke-width="3"/>',
'petal':'<g class="petals" fill="currentColor" stroke="none"><ellipse class="leaf a" cx="25" cy="22" rx="9" ry="15" transform="rotate(-35 25 22)"/><ellipse class="leaf b" cx="42" cy="29" rx="9" ry="15" transform="rotate(45 42 29)"/><ellipse class="leaf c" cx="28" cy="44" rx="9" ry="15" transform="rotate(80 28 44)"/></g>',
'assemble':'<g fill="currentColor" stroke="none"><rect class="tile a" x="12" y="12" width="18" height="18" rx="6"/><rect class="tile b" x="34" y="12" width="18" height="18" rx="6"/><rect class="tile c" x="12" y="34" width="18" height="18" rx="6"/><rect class="tile d" x="34" y="34" width="18" height="18" rx="6"/></g>',
'current':'<path class="wave a" d="M11 21 Q21 11 32 21 T53 21" stroke-width="6"/><path class="wave b" d="M11 33 Q21 23 32 33 T53 33" stroke-width="6"/><path class="wave c" d="M11 45 Q21 35 32 45 T53 45" stroke-width="6"/>',
'portal':'<rect class="frame" x="13" y="13" width="38" height="38" rx="12" stroke-width="5"/><path class="arrow" d="M24 32 H42 M34 24 L42 32 L34 40" stroke-width="5"/>'
}
CONCEPTS=[
('relay','04 / Relay','A question becomes a handoff. A traveling dot follows a rising path, then rests at its destination.'),
('orbit','05 / Orbit','A business at the center of a connected world. The satellite circles while the core stays steady.'),
('fold','06 / Fold W','Two soft folds assemble into a W. A compact monogram with a tactile opening gesture.'),
('weave','07 / Weave','People and agents meeting halfway. Two independent paths draw together into one interwoven mark.'),
('beacon','08 / Beacon','Be easier to find. Quiet expanding rings carry a signal out from a stable center.'),
('hinge','09 / Welcome','Open for the next customer. A small doorway opens and closes with a deliberate pause.'),
('petal','10 / Flourish','Growth through connection. Three organic forms turn together and settle into a friendly, rounded silhouette.'),
('assemble','11 / Gather','Scattered details become something useful. Four rounded modules gather into an orderly whole.'),
('current','12 / Current','A smoother customer journey. Three offset waves move in a gentle, coordinated rhythm.'),
('portal','13 / Forward','Understanding leads to action. An arrow moves through an open frame and returns for the next request.')
]
