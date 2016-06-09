///<reference path="../../../headers/common.d.ts" />
///<reference path="./d3.d.ts" />

import $  from 'jquery';
import _  from 'lodash';
import d3 from './d3';

class KPITooltip {
  $location: any;
  $timeout:  any;

  elem: any;

  constructor($location, $timeout) {
    this.$location = $location;
    this.$timeout  = $timeout;
  };

  getElem() {
    if (this.elem) { return this.elem; }
    return this.elem = d3.select("body")
      .append("div")
      .attr("class", "grafana-tooltip")
      .style("position", "absolute")
      .style("z-index", "10");
  };

  removeElem() {
    if (this.elem) {
      this.elem.remove();
      this.elem = null;
    }
  };

  render(d) {
    var states = ['OK', 'WARNING', 'CRITICAL'];
    var state  = states[d.state];

    var cmp = d.thresholds.reversed ? 'min' : 'max';
    var metric = _[cmp](d.values, v => { return v.value; });

    var template = _.template(''
      + '<div class="graph-tooltip-list-item">Name: <%= d.dashboard %> | <%= d.panel %></div>'
      + '<div class="graph-tooltip-list-item">State: <%= state %></div>'
      + '<div class="graph-tooltip-list-item">Target: <%= metric.target %></div>'
      + '<div class="graph-tooltip-list-item">Thresholds: warning=<%= d.thresholds.warning %>, critical=<%= d.thresholds.critical %></div>'
      + '<div class="graph-tooltip-list-item">Value: <%= metric.value %></div>'
    );
    return this.getElem().html(template({d: d, metric: metric, state: state}));
  };

  onMouseover(d) {
    return this.render(d);
  };

  onMousemove(d) {
    return this.getElem()
      .style('top',  (d3.event.pageY-15)+'px')
      .style('left', (d3.event.pageX+20)+'px');
  };

  onMouseout(d) {
    return this.removeElem();
  };

  onClick(d) {
    var self = this;
    return self.$timeout(() => {
      self.removeElem();
      self.$location.url(d.uri);
    });
  };

  remove() {
    this.removeElem();
  };
};

export class KPIRenderer {
  colors = ['green', 'orange', 'red'];

  root:   any;
  private tooltip: KPITooltip;

  $location: any;
  $timeout:  any;

  constructor(root, $location, $timeout) {
    this.root      = root;
    this.$location = $location;
    this.$timeout  = $timeout;

  };

  distributeCells(data, height, width) {
    var nearestRoot = Math.ceil(Math.sqrt(data.length));
    var rows = Math.ceil(nearestRoot * (height / width));
    var cols = Math.ceil(nearestRoot * (width  / height));

    var curRow = 0, curCol = 0;
    var cells = _.map(data, datum => {
      var cell = _.extend({}, datum, {row: curRow, col: curCol});
      if (curCol === cols - 1) {
        curCol = 0;
        curRow += 1;
      } else {
        curCol += 1;
      }
      return cell;
    });

    return {
      cells: cells,
      rows:  rows,
      cols:  cols,
      size:  Math.min((height / rows), (width / cols)),
    };
  };

  render(data, height, width) {
    var self = this;
    this.remove();

    var distribution = this.distributeCells(data, height, width);
    var gridSize     = distribution.size;
    var colors = this.colors;

    var kpi = d3.select(this.root[0])
      .append('svg')
        .attr('width',   d => { return '100%'; })
        .attr('height',  d => { return '100%'; })
      .append('g')
      .selectAll('.heatmap')
      .data(distribution.cells, d => { return d.col + ':' + d.row; })
      .enter().append('svg:rect')
        .attr('x',       d => { return d.col * gridSize; })
        .attr('y',       d => { return d.row * gridSize; })
        .attr('width',   d => { return gridSize;         })
        .attr('height',  d => { return gridSize;         })
        .style('fill',   d => { return colors[d.state];  });

    var tooltip = this.tooltip = new KPITooltip(this.$location, this.$timeout);
    kpi
      .on('mouseover', tooltip.onMouseover.bind(tooltip))
      .on('mousemove', tooltip.onMousemove.bind(tooltip))
      .on('mouseout',  tooltip.onMouseout.bind(tooltip))
      .on('click',     tooltip.onClick.bind(tooltip));
  };

  remove() {
    if (this.tooltip) {
      this.tooltip.remove();
    }
    if (this.root) {
      this.root.empty();
    }
  };
};
