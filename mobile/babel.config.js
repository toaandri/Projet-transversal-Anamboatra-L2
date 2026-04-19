/**
 * Anamboatra mobile — Babel config (Expo SDK 54).
 *
 * Depuis react-native-reanimated v4, le plugin Babel a été extrait dans le
 * package `react-native-worklets/plugin`. Il faut l'utiliser à la place de
 * l'ancien `react-native-reanimated/plugin` et il doit être listé EN DERNIER.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  };
};
