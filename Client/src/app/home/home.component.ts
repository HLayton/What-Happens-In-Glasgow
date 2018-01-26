import {AfterViewInit, Component, OnInit, ViewChild, ViewEncapsulation} from '@angular/core';
import {HttpClient} from '@angular/common/http';
import { forkJoin } from 'rxjs/observable/forkJoin';

import {GlasgowMapComponent} from '../glasgow-map/glasgow-map.component';
import {DataService} from '../data.service';
import { TweetService } from '../tweet.service';

declare let d3: any;

/**
 * The base component for the home screen. Manages the styling of the page as well as the loading and modification
 * of wards data.
 */
@Component({
  templateUrl: './home.component.html',
  styleUrls: [
    './home.component.css'
  ],
  encapsulation: ViewEncapsulation.None
})
export class HomeComponent implements OnInit, AfterViewInit {
  /* */
  public ward: any = {last_tweet: {text: 'n/a', user: {name: 'n/a/'}}};
  public wards = {};

  // Reference to the child GlasgowMapComponent
  @ViewChild(GlasgowMapComponent) map;

  constructor(
    private _http: HttpClient,
    private _dataService: DataService,
    private _tweet: TweetService
  ) { }

  ngOnInit() {
    this._tweet.glasgow_tweets.subscribe(msg => this.updateLastTweet(msg, 'glasgow-boundary'));

    this._tweet.geo_tweets.subscribe(msg => this.updateLastTweet(msg, msg.ward));
  }

  ngAfterViewInit() {
    this.loadWardsData();
  }

  private updateLastTweet(tweet, id) {
    const ward = this.wards[id];
    let sum = ward.average * ward.totals[ward.totals.length - 1];
    sum += tweet.score;

    ward.total++;
    ward.totals[ward.totals.length - 1]++;
    ward.average = sum / ward.totals[ward.totals.length - 1];
    ward.values[ward.values.length - 1].y = ward.average;
    ward.prettyAverage = Math.round(ward.average * 10) / 10;
    ward.last_tweet = tweet;

    this.wards[id] = ward;

    if (id === 'glasgow-boundary') {
      console.log('attempting a pulse');
      const element = document.getElementById(id);
      if (element.style.animationName === 'pulsate') {
        element.style.animationName = 'pulsate2';
      } else {
        element.style.animationName = 'pulsate';
      }
    }

    // console.log(this.wards[id]);
  }

  /**
   * Loads the wards from a JSON file. Generates data for these wards and passes this data
   * to the child map component.
   */
  private loadWardsData(): void {
    d3.json('./assets/json/glasgow-wards.json', (error, topology) => {
      if (error) {
        console.error(error);
      } else {
        const httpRequests = [];
        const httpRequestIds: string[] = [];

        // Extract data for each ward
        topology.features.forEach(feature => {
          this.wards[feature.properties.WD13CD] = { name: feature.properties.WD13NM };
          httpRequests.push(this._dataService.getWardData(feature.properties.WD13CD));
          httpRequestIds.push(feature.properties.WD13CD);
        });

        // All of glasgow data
        this.wards['glasgow-boundary'] = { name: 'Glasgow' };
        httpRequests.push(this._dataService.getGlasgowData());
        httpRequestIds.push('glasgow-boundary');

        // Assign all the values from the http requests
        forkJoin(httpRequests).subscribe(
          (wardValues: any) => {
            for (let i = 0; i < wardValues.length; i++) {
              console.log(wardValues[i]);
              const values: any = wardValues[i].values;
              const id = httpRequestIds[i];

              this.wards[id].values = values;
              this.wards[id].average = (values.length > 0) ? values[values.length - 1].y : 0;
              this.wards[id].prettyAverage = Math.round(this.wards[id].average * 10) / 10;
              this.wards[id].total = wardValues[i].total;
              this.wards[id].totals = wardValues[i].totals;
              this.wards[id].last_tweet = (wardValues[i].last_tweet) ?
                                            wardValues[i].last_tweet :
                                            {text: 'n/a', user: {name: 'n/a'}};
            }
          },
          err => {
            console.error(err);
            // console.log('Trying to load data again.');
            // this.loadWardsData();
          },
          () => {
            // Set values for and draw map of Glasgow
            this.map.wards = this.wards;
            this.map.drawMap(topology);

            this.setWard('glasgow-boundary');
          });

      }
    });
  }

  /**
   * Sets the ward as selected. Called by the child components.
   * @param {string} area - id of the selected ward
   */
  public setWard(area: string): void {
    this.ward = this.wards[area];

    this.setStyling(area);
  }

  /**
   * Sets the css styling based on which ward is selected.
   * @param {string} area - id of the selected ward
   */
  private setStyling(area: string): void {
    this.clearSelectedClass();
    // document.getElementById('chart-box').style.backgroundColor = this.map.colour(this.wards[area].average);
    document.getElementById(area).classList.add('selected');
  }

  /**
   * Removes the selected class from all wards drawn on the map
   */
  private clearSelectedClass(): void {
    for (const [key] of Object.entries(this.wards)) {
      document.getElementById(key).classList.remove('selected');
    }
  }

}

