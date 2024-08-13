import rational, { flatConfigBuilder } from 'eslint-config-rational';

/**
 * @type {Linter.FlatConfig[]}
 */
export default flatConfigBuilder()
  .use(rational)
  .ignore('**/{lib,dist,out,coverage}')
  .build();
