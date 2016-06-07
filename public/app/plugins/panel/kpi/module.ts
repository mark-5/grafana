///<reference path="../../../headers/common.d.ts" />

import config from 'app/core/config';
import $ from 'jquery';
import _ from 'lodash';
import d3 from 'd3';
import kbn from 'app/core/utils/kbn';
import {PanelCtrl} from 'app/plugins/sdk';

class DashboardModel {

  id:          number;
  panels:      PanelModel[];
  templating:  Object;
  title:       string;
  uid:         string;
  uri:         string;

  constructor(dashboard: Object) {
    this.id         = dashboard['dashboard']['id'];
    this.templating = dashboard['dashboard']['templating'];
    this.title      = dashboard['dashboard']['title'];
    this.uid        = _.uniqueId();

    var uri = '/dashboard';
    uri    += '/'+dashboard['meta']['type'];
    uri    += '/'+dashboard['meta']['slug'];
    this.uri = uri;

    var panels = this.panels = [];
    for (let row of dashboard['dashboard']['rows']) {
      for (let panel of row['panels']) {
        panels.push(new PanelModel(panel));
      }
    }
  };

};

class PanelModel {

  datasource: string;
  id:         number;
  scopedVars: Object;
  targets:    Object[];
  thresholds: Object;
  title:      string;
  uid:        string;

  constructor(panel: Object) {
    this.datasource = panel['datasource'];
    this.id         = panel['id'];
    this.scopedVars = panel['scopedVars'];
    this.targets    = panel['targets'];
    this.title      = panel['title'];
    this.uid        = _.uniqueId();

    this.thresholds = this.getThresholds(panel);
  };

  getThresholds(panel: Object) {
    var values = [];

    var panelType = panel['type'];
    if (panelType === 'graph') {
      var grid = panel['grid'];
      if (!(grid.threshold1 && grid.threshold2)) { return null; }
      values = [grid.threshold1, grid.threshold2];
    } else if (panelType === 'singlestat') {
      if (!panel['thresholds']) { return null; }
      values = panel['thresholds'].split(',');
    } else if (panelType === 'table') {
      // TODO: support tables
      return null;
    } else {
      return null;
    }

    var thresholds = {};
    if (values[0] < values[1]) {
      thresholds['reversed'] = false;
      thresholds['warning']  = values[0];
      thresholds['critical'] = values[1];
    } else {
      thresholds['reversed'] = true;
      thresholds['warning']  = values[1];
      thresholds['critical'] = values[0];
    }

    return thresholds;
  };

  getThresholdState(value: number) {
    if (!this.thresholds) { return 0; }

    if (this.isCritical(value)) {
      return 2;
    } else if (this.isWarning(value)) {
      return 1;
    } else {
      return 0;
    }
  }

  isWarning(value: number) {
    var thresholds = this.thresholds;
    if (!thresholds) { return false; }

    if (thresholds['reversed']) {
      return value <= thresholds['warning'];
    } else {
      return value >= thresholds['warning'];
    }
  };

  isCritical(value: number) {
    var thresholds = this.thresholds;
    if (!thresholds) { return false; }

    if (thresholds['reversed']) {
      return value <= thresholds['critical'];
    } else {
      return value >= thresholds['critical'];
    }
  };

};

class KPICtrl extends PanelCtrl {
  static templateUrl = 'panel.html';

  backendSrv:         any;
  dashboardSrv:       any;
  dashboardLoaderSrv: any;
  datasourceSrv:      any;
  templateSrv:        any;
  timeSrv:            any;
  $location:          any;

  $el:  any;
  data: any;
  private dashboards: DashboardModel[];

  dashboard:        Object;
  dashboardOptions: Object[];
  panelDefaults = {
    gridSize: 50,
    maxRows: 10,
  };

  interval:   any;
  range:      any;
  rangeRaw:   any;
  resolution: any;

  /** @ngInject */
  constructor($scope, $injector) {
    super($scope, $injector);
    _.defaults(this.panel, this.panelDefaults);

    this.backendSrv         = $injector.get('backendSrv');
    this.dashboardSrv       = $injector.get('dashboardSrv');
    this.dashboardLoaderSrv = $injector.get('dashboardLoaderSrv');
    this.datasourceSrv      = $injector.get('datasourceSrv');
    this.templateSrv        = $injector.get('templateSrv');
    this.timeSrv            = $injector.get('timeSrv');
    this.$location          = $injector.get('$location');

    this.events.on('init-edit-mode', this.onInitEditMode.bind(this));
    this.events.on('refresh', this.onRefresh.bind(this));
    this.events.on('render',  this.onRender.bind(this));
    this.events.on('data-received', data => {
      this.data = data;
      this.render();
    });
  };

  private onInitEditMode() {
    this.addEditorTab('Options', 'public/app/plugins/panel/kpi/editor.html');
    this.editorTabIndex = 1;
  };

  private onRefresh(dataList) {
    var dashboards = this.getDashboards();
    dashboards.then(dashboards => {
      this.dashboards = dashboards;
      this.dashboardOptions = _.map(dashboards, d => { return {id: d.id, title: d.title}; });
    });

    var selected ;
    if (this.panel.dashboard) {
      var want = this.panel.dashboard;
      selected = dashboards.then(dashboards => {
        return _.where(dashboards, {id: want});
      });
    }
    if (!selected) { return; }
    console.log({selected: selected});

    var queries = this.queryDashboards(selected);
    var data    = queries.then(this.handleQueryResult.bind(this));
    data.then(data => {
      this.events.emit('data-received', data);
    });
  };

  private getDashboards() {
    var self = this;

    var dashboards = self.backendSrv.search({}).then(dashboards => {
      var promises = _.map(dashboards, dash => {
        var parts = dash.uri.split('/', 2);
        return self.backendSrv.getDashboard(parts[0], parts[1])
          .then(dashboard => {
            return new DashboardModel(dashboard);
          });
      });
      return Promise.all(promises);
    });

    return dashboards;
  };

  private updateTimeRange() {
    this.range      = this.timeSrv.timeRange();
    this.rangeRaw   = this.timeSrv.timeRange(false);
    this.resolution = Math.ceil($(window).width() * (this.panel.span / 12));
    this.interval   = kbn.calculateInterval(this.range, this.resolution);
  };

  private handleQueryResult(results) {
    var data = [];

    for (let result of results) {
      if (!(result && result.data)) { continue; }
      var dashboard = _.find(this.dashboards,  {uid: result.dashboard});
      if (!dashboard) { continue; }
      var panel = _.find(dashboard.panels, {uid: result.panel});
      if (!panel) { continue; }

      var scopedVars  = this.getScopedVars(panel, dashboard);
      var templateSrv = this.templateSrv;

      for (let datum of result.data) {
        if (!datum && datum.datapoints) { continue; }

        var value = _.last(datum.datapoints)[0];
        var state = panel.getThresholdState(value);
        data.push({
          dashboard: templateSrv.replace(dashboard.title, scopedVars),
          panel:     templateSrv.replace(panel.title, scopedVars),
          state:     state,
          target:    datum.target,
          uri:       dashboard.uri,
          value:     value,
        });
      }
    }

    return data;
  };

  private queryDashboards(dashboards: Promise<DashboardModel[]>) {
    var self = this;

    var queries = dashboards.then(dashboards => {
      var promises = [];
      _.each(dashboards, dashboard => {
        _.each(dashboard.panels, panel => {
          if (!panel.targets) { return; }

          var datasource = panel.datasource;
          var targets    = panel.targets;
          var scopedVars = self.getScopedVars(panel, dashboard);
          var params     = {dashboard: dashboard.uid, panel: panel.uid};

          var query = self.issueQueries(datasource, targets, scopedVars)
            .then(result => { return _.extend({}, result, params); });

          promises.push(query);
        });
      });
      return Promise.all(promises);
    });

    return queries;
  };

  private getScopedVars(panel: PanelModel, dashboard: DashboardModel) {
    var templateSrv = this.templateSrv;

    var dashboardScopedVars = {};
    for (let variable of dashboard.templating['list']) {
      var name  = variable.name;
      var value = variable.current;
      if (!value) { continue; }
      if (templateSrv.isAllValue(value.value)) {
        value = _.extend({}, value, {value: templateSrv.getAllValue(variable)});
      }
      dashboardScopedVars[name] = value;
    }

    return _.extend({}, dashboardScopedVars, panel.scopedVars || {});
  };

  private issueQueries(datasourceName: string, targets: Object[], scopedVars: Object) {
    this.updateTimeRange();

    var metricsQuery = {
      panelId:       this.panel.id,
      range:         this.range,
      rangeRaw:      this.rangeRaw,
      interval:      this.interval,
      targets:       targets,
      format:        'json',
      maxDataPoints: this.resolution,
      scopedVars:    scopedVars,
      cacheTimeout:  this.panel.cacheTimeout,
    };

    return this.datasourceSrv.get(datasourceName)
      .then(datasource => {
        return datasource.query(metricsQuery);
      });
  };

  link(scope, elem, attrs, ctrl) {
    this.$el = elem.find('.kpi-container');
  }

  onRender() {
    var $el = this.$el;
    $el.html('');

    var maxRows = this.panel.maxRows || 10;
    var curRow = 0;
    var curCol = 0;
    var cells = _.map(this.data, datum => {
      var cell = _.extend({}, datum, {row: curRow, col: curCol});
      if (curRow === maxRows - 1) {
        curRow = 0;
        curCol += 1;
      } else {
        curRow += 1;
      }
      return cell;
    });

    var colors = ['green', 'orange', 'red'];
    var gridSize = this.panel.gridSize || 50,
        h = gridSize,
        w = gridSize;

    var svg = d3.select($el[0])
      .append('svg')
      .append('g');

    var heatMap = svg.selectAll('.heatmap')
      .data(cells, d => { return d.col + ':' + d.row; })
      .enter().append('svg:rect')
        .attr("x",       d => { return d.row * w;       })
        .attr("y",       d => { return d.col * h;       })
        .attr("width",   d => { return w;               })
        .attr("height",  d => { return h;               })
        .style("fill",   d => { return colors[d.state]; });

    var tooltip;
    var getToolTip = () => {
      if (tooltip) { return tooltip; }
      return tooltip = d3.select("body")
        .append("div")
        .attr("class", "grafana-tooltip")
        .style("position", "absolute")
        .style("z-index", "10");
    };

    var removeToolTip = () => {
      if (!tooltip) { return; }
      tooltip.remove();
      tooltip = null;
    };

    var $location = this.$location;
    var $timeout  = this.$timeout;
    heatMap
      .on("mouseover", d => {return getToolTip().text(d.dashboard+': '+d.panel);})
      .on("mousemove", d => {return getToolTip().style("top", (d3.event.pageY-15)+"px").style("left",(d3.event.pageX+20)+"px");})
      .on("mouseout", d => {return removeToolTip();})
      .on("click", d => { return $timeout(() => { removeToolTip(); $location.url(d.uri); }); });

  };

}

export {KPICtrl as PanelCtrl};
