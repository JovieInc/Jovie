import type { Meta, StoryObj } from '@storybook/react';
import * as React from 'react';
import { 
  Select, 
  SelectContent, 
  SelectGroup, 
  SelectItem, 
  SelectLabel, 
  SelectSeparator, 
  SelectTrigger, 
  SelectValue,
  SelectCompat 
} from './select';
import { Globe, Music, User, Settings, Star, Heart } from 'lucide-react';

const meta = {
  title: 'UI/Atoms/Select',
  component: Select,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

// Basic Select
export const Basic: Story = {
  render: () => (
    <div className="w-64">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a fruit" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="apple">Apple</SelectItem>
          <SelectItem value="banana">Banana</SelectItem>
          <SelectItem value="orange">Orange</SelectItem>
          <SelectItem value="grape">Grape</SelectItem>
          <SelectItem value="strawberry">Strawberry</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

// Size Variants
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-64">
      <Select>
        <SelectTrigger size="sm">
          <SelectValue placeholder="Small size" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
          <SelectItem value="2">Option 2</SelectItem>
          <SelectItem value="3">Option 3</SelectItem>
        </SelectContent>
      </Select>

      <Select>
        <SelectTrigger size="md">
          <SelectValue placeholder="Medium size (default)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
          <SelectItem value="2">Option 2</SelectItem>
          <SelectItem value="3">Option 3</SelectItem>
        </SelectContent>
      </Select>

      <Select>
        <SelectTrigger size="lg">
          <SelectValue placeholder="Large size" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
          <SelectItem value="2">Option 2</SelectItem>
          <SelectItem value="3">Option 3</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

// With Groups and Labels
export const WithGroups: Story = {
  render: () => (
    <div className="w-64">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a timezone" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>North America</SelectLabel>
            <SelectItem value="est">Eastern Standard Time (EST)</SelectItem>
            <SelectItem value="cst">Central Standard Time (CST)</SelectItem>
            <SelectItem value="mst">Mountain Standard Time (MST)</SelectItem>
            <SelectItem value="pst">Pacific Standard Time (PST)</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Europe & Africa</SelectLabel>
            <SelectItem value="gmt">Greenwich Mean Time (GMT)</SelectItem>
            <SelectItem value="cet">Central European Time (CET)</SelectItem>
            <SelectItem value="eet">Eastern European Time (EET)</SelectItem>
            <SelectItem value="west">Western European Summer Time (WEST)</SelectItem>
          </SelectGroup>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Asia</SelectLabel>
            <SelectItem value="msk">Moscow Time (MSK)</SelectItem>
            <SelectItem value="ist">India Standard Time (IST)</SelectItem>
            <SelectItem value="cst_china">China Standard Time (CST)</SelectItem>
            <SelectItem value="jst">Japan Standard Time (JST)</SelectItem>
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  ),
};

// With Icons (using compatibility wrapper)
export const WithIcons: Story = {
  render: () => (
    <div className="w-64">
      <SelectCompat
        placeholder="Select a profile type"
        options={[
          { value: 'artist', label: 'Artist Profile', icon: <Music className="h-4 w-4" /> },
          { value: 'personal', label: 'Personal Profile', icon: <User className="h-4 w-4" /> },
          { value: 'business', label: 'Business Profile', icon: <Globe className="h-4 w-4" /> },
          { value: 'creator', label: 'Creator Profile', icon: <Star className="h-4 w-4" /> },
        ]}
      />
    </div>
  ),
};

// Long List with Scroll
export const LongList: Story = {
  render: () => {
    const countries = [
      'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina',
      'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
      'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin',
      'Bhutan', 'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil',
      'Brunei', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cambodia', 'Cameroon',
      'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile',
      'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba',
      'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica',
      'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Estonia',
      'Ethiopia', 'Fiji', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia',
      'Germany', 'Ghana', 'Greece', 'Grenada', 'Guatemala', 'Guinea', 'Guyana',
      'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran',
      'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica', 'Japan', 'Jordan',
      'Kazakhstan', 'Kenya', 'Kuwait', 'Kyrgyzstan', 'Latvia', 'Lebanon',
      'Lesotho', 'Liberia', 'Libya', 'Lithuania', 'Luxembourg', 'Madagascar',
      'Malawi', 'Malaysia', 'Maldives', 'Mali', 'Malta', 'Mexico', 'Moldova',
      'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
      'Namibia', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
      'Nigeria', 'North Korea', 'Norway', 'Oman', 'Pakistan', 'Panama',
      'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines', 'Poland', 'Portugal',
      'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saudi Arabia', 'Senegal', 'Serbia',
      'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Somalia', 'South Africa',
      'South Korea', 'Spain', 'Sri Lanka', 'Sudan', 'Sweden', 'Switzerland', 'Syria',
      'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand', 'Togo', 'Trinidad and Tobago',
      'Tunisia', 'Turkey', 'Uganda', 'Ukraine', 'United Arab Emirates',
      'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela',
      'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
    ];
    
    return (
      <div className="w-64">
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {countries.map((country) => (
              <SelectItem key={country.toLowerCase()} value={country.toLowerCase()}>
                {country}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  },
};

// With Disabled Items
export const WithDisabledItems: Story = {
  render: () => (
    <div className="w-64">
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="Select a subscription" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="free">Free Plan</SelectItem>
          <SelectItem value="basic">Basic - $9/month</SelectItem>
          <SelectItem value="pro" disabled>
            Pro - $29/month (Coming Soon)
          </SelectItem>
          <SelectItem value="enterprise" disabled>
            Enterprise - Contact Sales
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

// Disabled State
export const Disabled: Story = {
  render: () => (
    <div className="w-64">
      <Select disabled>
        <SelectTrigger>
          <SelectValue placeholder="Disabled select" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="1">Option 1</SelectItem>
        </SelectContent>
      </Select>
    </div>
  ),
};

// Controlled Component
export const Controlled: Story = {
  render: () => {
    const [value, setValue] = React.useState('apple');
    
    return (
      <div className="flex flex-col gap-4 w-64">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger>
            <SelectValue placeholder="Select a fruit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="apple">Apple</SelectItem>
            <SelectItem value="banana">Banana</SelectItem>
            <SelectItem value="orange">Orange</SelectItem>
            <SelectItem value="grape">Grape</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-sm text-secondary-token">Selected value: {value}</p>
      </div>
    );
  },
};

// With Label and Error (using compatibility wrapper)
export const WithLabelAndError: Story = {
  render: () => (
    <div className="flex flex-col gap-4 w-64">
      <SelectCompat
        label="Country"
        placeholder="Select your country"
        required
        options={[
          { value: 'us', label: 'United States' },
          { value: 'uk', label: 'United Kingdom' },
          { value: 'ca', label: 'Canada' },
          { value: 'au', label: 'Australia' },
        ]}
      />
      
      <SelectCompat
        label="Language"
        placeholder="Select a language"
        error="Please select a valid language"
        options={[
          { value: 'en', label: 'English' },
          { value: 'es', label: 'Spanish' },
          { value: 'fr', label: 'French' },
          { value: 'de', label: 'German' },
        ]}
      />
    </div>
  ),
};

// Dark Mode Comparison
export const DarkModeComparison: Story = {
  render: () => (
    <div className="flex gap-8">
      <div className="w-64 p-4 rounded-lg bg-white">
        <h3 className="mb-4 font-semibold text-gray-900">Light Mode</h3>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Preferences</SelectLabel>
              <SelectItem value="theme">Theme Settings</SelectItem>
              <SelectItem value="language">Language</SelectItem>
              <SelectItem value="timezone">Timezone</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Account</SelectLabel>
              <SelectItem value="profile">Edit Profile</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="team">Team Settings</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      
      <div className="w-64 p-4 rounded-lg bg-gray-900 dark">
        <h3 className="mb-4 font-semibold text-gray-100">Dark Mode</h3>
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select an option" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Preferences</SelectLabel>
              <SelectItem value="theme">Theme Settings</SelectItem>
              <SelectItem value="language">Language</SelectItem>
              <SelectItem value="timezone">Timezone</SelectItem>
            </SelectGroup>
            <SelectSeparator />
            <SelectGroup>
              <SelectLabel>Account</SelectLabel>
              <SelectItem value="profile">Edit Profile</SelectItem>
              <SelectItem value="billing">Billing</SelectItem>
              <SelectItem value="team">Team Settings</SelectItem>
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  ),
};