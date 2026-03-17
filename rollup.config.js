import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

export default {
    input: 'src/app.js',
    output: {
        file: 'dist/app.bundle.js',
        format: 'iife',
        name: 'modeld',
        globals: {
            'js-yaml': 'jsyaml'
        }
    },
    external: (id) => id === 'js-yaml' || id.startsWith('ace-builds'),
    plugins: [
        resolve({ browser: true }),
        commonjs()
    ]
};
