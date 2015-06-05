define([
  'angular',
  'app',
],
function (angular, app) {
  'use strict';

  var module = angular.module('grafana.panels.extension', []);
  app.useModule(module);

  module.directive('extensionPanel', function () {

    return {
      link: function(scope, elem) {
        scope.$on('render', function () {
          elem.html('This is my extension content');
          console.log("received data", scope.data);
        });
      },
    };

  });
});
