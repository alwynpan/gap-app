module.exports = function transformImportMetaEnv({ types: t }) {
  const isImportMetaEnv = (node) => {
    if (!t.isMemberExpression(node)) return false;
    if (!t.isMetaProperty(node.object)) return false;

    const isImportMeta =
      node.object.meta?.name === 'import' &&
      node.object.property?.name === 'meta';

    const isEnvProperty =
      (!node.computed && t.isIdentifier(node.property, { name: 'env' })) ||
      (node.computed && t.isStringLiteral(node.property, { value: 'env' }));

    return isImportMeta && isEnvProperty;
  };

  return {
    name: 'transform-import-meta-env',
    visitor: {
      MemberExpression(path) {
        if (isImportMetaEnv(path.node)) {
          path.replaceWith(
            t.memberExpression(t.identifier('process'), t.identifier('env'))
          );
        }
      },
    },
  };
};
