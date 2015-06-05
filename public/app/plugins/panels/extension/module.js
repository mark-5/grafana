define([
  'angular',
  'app',
  'lodash',
  'components/panelmeta',
  './extensionPanel',
],
function (angular, app, _, PanelMeta) {
  'use strict';

  var module = angular.module('grafana.panels.extension');
  app.useModule(module);

  // dynamically loaded by panelDirective.js
  module.directive('grafanaPanelExtension', function() {
    return {
      controller: 'ExtensionCtrl',
      // need a template to use grafana-panel
      templateUrl: 'app/plugins/panels/extension/module.html',
    };
  });

  module.controller('ExtensionCtrl', function($scope, panelSrv, panelHelper) {
    // panelSrv requires the following setup
    $scope.panelMeta = new PanelMeta({
      panelName:     'Extension',
      editIcon:      'fa fa-dashboard',
      fullscreen:    true,
      metricsEditor: true
    });

    var _d = {
      targets: [{}], // needed to make the query editor visible
    };
    _.defaults($scope.panel, _d);

    // this is the real work horse function
    // here is where we format the data structures used for rendering
    //   and add them to the scope
    $scope.refreshData = function(datasource) {
      panelHelper.updateTimeRange($scope);

      return panelHelper.issueMetricQuery($scope, datasource)
        .then($scope.dataHandler, $scope.errorHandler);
    };

    $scope.dataHandler = function(results) {
      $scope.data = results.data;
      $scope.render();
    };

    $scope.errorHandler = function() { };

    $scope.render = function() {
      // let the extension directives know to render
      $scope.$broadcast('render');
    };

    panelSrv.init($scope);
  });
});
