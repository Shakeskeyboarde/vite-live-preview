import { defaultRelaxedFiles, rational } from 'eslint-config-rational';

export default rational({
  enableJsdoc: false,
  relaxedFiles: [...defaultRelaxedFiles, '**/*.js'],
});
