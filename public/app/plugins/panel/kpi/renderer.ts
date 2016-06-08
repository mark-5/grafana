///<reference path="../../../headers/common.d.ts" />
///<reference path="./d3.d.ts" />

import d3 from './d3';
import _ from 'lodash';

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

  onMouseover(d) {
    return this.getElem().text(d.dashboard+': '+d.panel);
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

  root:  any;
  panel: any;
  private tooltip: KPITooltip;

  $location: any;
  $timeout:  any;

  constructor(root, panel, $location, $timeout) {
    this.panel     = panel;
    this.root      = root;
    this.$location = $location;
    this.$timeout  = $timeout;
  };

  render(data) {
    this.remove();

    var maxRows = this.panel.maxRows;
    var curRow = 0, curCol = 0;

    var cells = _.map(data, datum => {
      var cell = _.extend({}, datum, {row: curRow, col: curCol});
      if (curRow === maxRows - 1) {
        curRow = 0;
        curCol += 1;
      } else {
        curRow += 1;
      }
      return cell;
    });

    var h = this.panel.gridSize;
    var w = this.panel.gridSize;
    var colors = this.colors;

    var kpi = d3.select(this.root[0])
      .append('svg')
      .append('g')
      .selectAll('.heatmap')
      .data(cells, d => { return d.col + ':' + d.row; })
      .enter().append('svg:rect')
        .attr('x',       d => { return d.row * w;       })
        .attr('y',       d => { return d.col * h;       })
        .attr('width',   d => { return w;               })
        .attr('height',  d => { return h;               })
        .style('fill',   d => { return colors[d.state]; });

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
