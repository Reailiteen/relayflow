import base from '@relayflow/config/eslint/base';
import { layerConfig } from '@relayflow/config/eslint/layers';

export default [...base, layerConfig('ports')];
