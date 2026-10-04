import {
  Ban,
  BookOpen,
  ChevronDown,
  Eraser,
  Gauge,
  Hourglass,
  Play,
  Power,
  Route,
  Send,
  Square,
  StepForward,
  X,
  Zap,
  createElement,
} from 'lucide';

const ICONS = {
  clear: Ban,
  scenarios: BookOpen,
  chevron: ChevronDown,
  caches: Eraser,
  speed: Gauge,
  time: Hourglass,
  load: Play,
  power: Power,
  brand: Route,
  api: Send,
  stop: Square,
  next: StepForward,
  close: X,
  burst: Zap,
};

// SVG de Lucide como cadena, para meterlo en plantillas HTML
export function icon(name, size = 16) {
  return createElement(ICONS[name], {
    width: size,
    height: size,
    'stroke-width': 1.8,
    'aria-hidden': 'true',
  }).outerHTML;
}
